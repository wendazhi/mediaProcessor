-- ============================================================
-- 常用任务查询 SQL
-- ============================================================

-- 1. 查询最近 20 条任务（按时间倒序）
SELECT
  id AS task_id,
  user_id,
  session_id,
  status,
  input_type,
  model,
  prompt,
  retry_count,
  error,
  created_at,
  updated_at
FROM tasks
ORDER BY created_at DESC
LIMIT 20;


-- 2. 查询某用户的全部任务
SELECT
  id AS task_id,
  status,
  input_type,
  model,
  result->>'text' AS result_text,
  created_at,
  updated_at
FROM tasks
WHERE user_id = 'user_001'
ORDER BY created_at DESC;


-- 3. 查询某 session 的任务列表
SELECT
  id AS task_id,
  status,
  input_type,
  model,
  created_at
FROM tasks
WHERE session_id = 'session_001'
ORDER BY created_at DESC;


-- 4. 查询某条任务的完整信息（含结果）
SELECT *
FROM tasks
WHERE id = 'your-task-id-here';


-- 5. 按状态统计任务数量
SELECT
  status,
  COUNT(*) AS count
FROM tasks
GROUP BY status
ORDER BY count DESC;


-- 6. 按输入类型统计
SELECT
  input_type,
  COUNT(*) AS count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM tasks
GROUP BY input_type
ORDER BY count DESC;


-- 7. 按模型统计使用情况
SELECT
  model,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)))::numeric, 2) AS avg_duration_seconds
FROM tasks
GROUP BY model
ORDER BY total DESC;


-- 8. 查询失败的任务（含错误信息）
SELECT
  id AS task_id,
  user_id,
  input_type,
  model,
  prompt,
  error,
  retry_count,
  created_at,
  updated_at
FROM tasks
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 50;


-- 9. 查询正在处理中的任务（可能卡住的）
SELECT
  id AS task_id,
  user_id,
  input_type,
  model,
  EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 AS processing_minutes,
  created_at
FROM tasks
WHERE status = 'processing'
ORDER BY updated_at ASC;


-- 10. 查询等待重试的任务
SELECT
  id AS task_id,
  status,
  retry_count,
  max_retries,
  next_retry_at,
  error,
  created_at
FROM tasks
WHERE status = 'pending'
  AND next_retry_at IS NOT NULL
  AND next_retry_at > NOW()
ORDER BY next_retry_at ASC;


-- 11. 查询今日任务统计
SELECT
  COUNT(*) AS total_tasks,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending,
  COUNT(*) FILTER (WHERE status = 'processing') AS processing,
  COUNT(DISTINCT user_id) AS unique_users
FROM tasks
WHERE created_at >= CURRENT_DATE
  AND created_at < CURRENT_DATE + INTERVAL '1 day';


-- 12. 查询每小时任务量（最近 24 小时）
SELECT
  DATE_TRUNC('hour', created_at) AS hour,
  COUNT(*) AS task_count,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed
FROM tasks
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;


-- 13. 查询某个用户的任务结果（只返回有结果的）
SELECT
  id AS task_id,
  input_type,
  model,
  prompt,
  result->>'text' AS generated_text,
  result->'usage'->>'tokens' AS token_usage,
  created_at
FROM tasks
WHERE user_id = 'user_001'
  AND status = 'completed'
  AND result IS NOT NULL
ORDER BY created_at DESC;


-- 14. 查询慢任务（处理超过 30 秒的）
SELECT
  id AS task_id,
  user_id,
  input_type,
  model,
  EXTRACT(EPOCH FROM (updated_at - created_at))::int AS duration_seconds,
  created_at
FROM tasks
WHERE status = 'completed'
  AND EXTRACT(EPOCH FROM (updated_at - created_at)) > 30
ORDER BY duration_seconds DESC
LIMIT 50;


-- 15. 查询重复失败的任务（重试耗尽）
SELECT
  id AS task_id,
  user_id,
  input_type,
  model,
  retry_count,
  error,
  created_at
FROM tasks
WHERE status = 'failed'
  AND retry_count >= max_retries
ORDER BY created_at DESC;


-- 16. 清理旧数据（删除 N 天前的已完成任务）
-- DELETE FROM tasks
-- WHERE status = 'completed'
--   AND created_at < NOW() - INTERVAL '30 days';


-- 17. 重置卡住的旧任务（手动恢复）
-- UPDATE tasks
-- SET status = 'pending', updated_at = NOW()
-- WHERE status = 'processing'
--   AND updated_at < NOW() - INTERVAL '10 minutes';


-- 18. 强制重试失败任务
-- UPDATE tasks
-- SET status = 'pending',
--     retry_count = 0,
--     next_retry_at = NULL,
--     error = NULL,
--     updated_at = NOW()
-- WHERE id = 'your-task-id-here';
