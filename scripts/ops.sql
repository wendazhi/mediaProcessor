-- ============================================================
-- AI Media Processor - 运维 SQL
--
-- 用法:
--   psql "$(grep DATABASE_URL .env | cut -d= -f2-)" -f scripts/ops.sql
--   或先 psql 连接，再 \i scripts/ops.sql
-- ============================================================

-- --------------------------------------------------
-- 一、系统概览（快速了解当前状态）
-- --------------------------------------------------

-- 1. 任务总量及各状态分布
SELECT
  status,
  COUNT(*) AS count,
  ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS pct
FROM tasks
GROUP BY status
ORDER BY count DESC;

-- 2. 今日任务统计
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending,
  COUNT(*) FILTER (WHERE status = 'processing') AS processing,
  COUNT(DISTINCT user_id) AS unique_users
FROM tasks
WHERE created_at >= CURRENT_DATE;

-- 3. 最近 24 小时每小时任务量
SELECT
  DATE_TRUNC('hour', created_at) AS hour,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed
FROM tasks
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- --------------------------------------------------
-- 二、问题排查
-- --------------------------------------------------

-- 4. 卡住的任务（processing 超过 10 分钟）
SELECT
  id AS task_id,
  user_id,
  input_type,
  model,
  EXTRACT(EPOCH FROM (NOW() - updated_at))::int / 60 AS stuck_minutes,
  created_at
FROM tasks
WHERE status = 'processing'
  AND updated_at < NOW() - INTERVAL '10 minutes'
ORDER BY updated_at ASC;

-- 5. 失败的任务（最近 50 条，含错误信息）
SELECT
  id AS task_id,
  user_id,
  input_type,
  model,
  prompt,
  error,
  retry_count,
  created_at
FROM tasks
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 50;

-- 6. 重试耗尽的任务（retry_count >= max_retries）
SELECT
  id AS task_id,
  user_id,
  input_type,
  model,
  retry_count,
  max_retries,
  error,
  created_at
FROM tasks
WHERE status = 'failed'
  AND retry_count >= max_retries
ORDER BY created_at DESC
LIMIT 50;

-- 7. 等待重试的任务
SELECT
  id AS task_id,
  retry_count,
  next_retry_at,
  EXTRACT(EPOCH FROM (next_retry_at - NOW()))::int AS wait_seconds,
  error
FROM tasks
WHERE status = 'pending'
  AND next_retry_at IS NOT NULL
  AND next_retry_at > NOW()
ORDER BY next_retry_at ASC;

-- 8. 慢任务（处理时间超过 30 秒）
SELECT
  id AS task_id,
  user_id,
  input_type,
  model,
  EXTRACT(EPOCH FROM (updated_at - created_at))::int AS duration_sec,
  created_at
FROM tasks
WHERE status = 'completed'
  AND EXTRACT(EPOCH FROM (updated_at - created_at)) > 30
ORDER BY duration_sec DESC
LIMIT 30;

-- 9. 按模型统计成功率
SELECT
  model,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*),
    1
  ) AS success_rate_pct,
  ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)))::numeric, 1) AS avg_sec
FROM tasks
GROUP BY model
ORDER BY total DESC;

-- --------------------------------------------------
-- 三、详细查询
-- --------------------------------------------------

-- 10. 查询单条任务完整信息（替换 id）
-- SELECT * FROM tasks WHERE id = 'your-task-id';

-- 11. 查询某用户全部任务（替换 user_id）
-- SELECT id, status, input_type, model, result->>'text' AS text, created_at FROM tasks WHERE user_id = 'user_001' ORDER BY created_at DESC;

-- 12. 查询某 session 的任务（替换 session_id）
-- SELECT id, status, input_type, model, created_at FROM tasks WHERE session_id = 'session_001' ORDER BY created_at DESC;

-- --------------------------------------------------
-- 四、运维操作（谨慎执行）
-- --------------------------------------------------

-- 13. 重置卡住的旧任务（processing 超过 N 分钟）
-- UPDATE tasks
-- SET status = 'pending', updated_at = NOW()
-- WHERE status = 'processing'
--   AND updated_at < NOW() - INTERVAL '10 minutes';

-- 14. 强制重试某条失败任务（替换 id）
-- UPDATE tasks
-- SET status = 'pending',
--     retry_count = 0,
--     next_retry_at = NULL,
--     error = NULL,
--     updated_at = NOW()
-- WHERE id = 'your-task-id';

-- 15. 批量重试所有失败任务
-- UPDATE tasks
-- SET status = 'pending',
--     retry_count = 0,
--     next_retry_at = NULL,
--     error = NULL,
--     updated_at = NOW()
-- WHERE status = 'failed';

-- 16. 删除 N 天前的已完成任务（清理历史数据）
-- DELETE FROM tasks
-- WHERE status = 'completed'
--   AND created_at < NOW() - INTERVAL '30 days';

-- 17. 删除某用户的全部任务
-- DELETE FROM tasks WHERE user_id = 'user-to-delete';

-- 18. 清空全部任务（危险！）
-- TRUNCATE TABLE tasks RESTART IDENTITY;
