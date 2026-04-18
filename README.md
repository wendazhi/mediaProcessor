# AI Media Processor

接收图片、视频、音频、链接等输入，调用 AI 模型生成结构化解读的 REST API 服务。

## 环境要求

- Node.js >= 20
- PostgreSQL >= 14
- tsx（开发热重载）

## 安装依赖

```bash
npm install
```

## 数据库初始化

```bash
# 创建数据库
createdb media_processor

# 推送到数据库（创建表结构）
npm run db:push
```

## 配置环境变量

复制 `.env.example` 为 `.env` 并填写：

```bash
cp .env.example .env
```

关键配置项：

| 变量 | 说明 | 示例 |
|------|------|------|
| `API_KEY` | API 鉴权密钥 | `test-key` |
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://user:pass@localhost:5432/media_processor` |
| `VOLCANO_API_KEY` | 火山引擎 API Key | `your-key` |
| `VOLCANO_VISION_MODEL` | 视觉/多模态模型 ID | `doubao-seed-2-0-pro-xxx` |
| `VOLCANO_TEXT_MODEL` | 文本模型 ID | `doubao-seed-2-0-pro-xxx` |

## 启动服务

需要同时启动 **API 服务** 和 **Worker**：

### 终端 1 - API 服务

```bash
npm run dev
# Server listening on port 3000
```

### 终端 2 - Worker（处理任务队列）

```bash
npm run dev:worker
# Worker started
```

> 生产环境：`npm run build` 后分别 `npm start` 和 `npm run start:worker`

---

## PM2 部署（推荐生产）

先全局安装 PM2：

```bash
npm install -g pm2
```

### 开发模式（TS 直接跑，热重载）

```bash
pm2 start ecosystem.config.cjs --env development
```

### 生产模式（编译后运行）

```bash
# 1. 编译 TypeScript
npm run build

# 2. 启动（默认读取 ecosystem.config.cjs）
pm2 start

# 常用命令
pm2 status              # 查看进程状态
pm2 logs                # 实时查看日志
pm2 logs media-api      # 只看 API 日志
pm2 logs media-worker   # 只看 Worker 日志
pm2 restart media-api   # 重启 API
pm2 restart media-worker # 重启 Worker
pm2 stop all            # 停止全部
pm2 delete all          # 删除全部
```

### 配置说明

| 进程 | 数量 | 模式 | 内存限制 |
|------|------|------|---------|
| `media-api` | 1 | fork | 512M |
| `media-worker` | 2 | cluster | 1G |

Worker 用 `cluster` 模式可以多实例并行消费队列，API 用 `fork` 单实例（WebSocket/LISTEN 不适合多实例）。

---

## 接口测试文档

### 通用说明

- 基础地址：`http://localhost:3000`
- 鉴权：所有请求 Header 带 `Authorization: Bearer {API_KEY}`
- Content-Type：`application/json`

---

### 1. 创建任务（异步）

提交一个链接，Worker 异步处理，通过 task_id 查询结果。

```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "input_url": "https://www.volcengine.com/docs/82379/1362931",
    "model": "volcano-text",
    "user_id": "user_001",
    "session_id": "session_001",
    "prompt": "请总结这个页面的主要内容"
  }'
```

**响应：**

```json
{
  "code": 200,
  "data": {
    "task_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "user_001",
    "session_id": "session_001",
    "status": "pending",
    "created_at": "2026-04-18T12:00:00.000Z"
  },
  "message": "success"
}
```

---

### 2. 创建任务（同步阻塞）

加上 `sync=true`，接口会阻塞等待任务完成，直接返回结果。超时（默认 60s）则返回 processing 状态。

```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "input_url": "https://www.volcengine.com/docs/82379/1362931",
    "model": "volcano-text",
    "user_id": "user_001",
    "session_id": "session_001",
    "prompt": "请用一句话总结这个页面",
    "sync": "true",
    "timeout": "60"
  }'
```

**成功响应：**

```json
{
  "code": 200,
  "data": {
    "task_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "user_001",
    "session_id": "session_001",
    "status": "completed",
    "input_type": "link",
    "model": "volcano-text",
    "result": {
      "text": "这是火山方舟多模态理解模块的图片理解文档页面...",
      "usage": { "tokens": 1234 }
    },
    "created_at": "2026-04-18T12:00:00.000Z",
    "completed_at": "2026-04-18T12:00:08.000Z"
  },
  "message": "success"
}
```

---

### 3. 查询任务结果

```bash
curl http://localhost:3000/api/v1/tasks/{task_id} \
  -H "Authorization: Bearer test-key"
```

---

### 4. 图片分析（URL）

```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "input_url": "https://example.com/photo.jpg",
    "model": "volcano-vision",
    "user_id": "user_001",
    "session_id": "session_001",
    "prompt": "请详细描述这张图片的内容",
    "sync": "true"
  }'
```

> 类型自动识别（HEAD 请求检测 Content-Type: image/*）

---

### 5. 图片分析（Base64）

```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "input_url": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "model": "volcano-vision",
    "user_id": "user_001",
    "session_id": "session_001",
    "prompt": "描述这张图片",
    "sync": "true"
  }'
```

---

### 6. 视频分析

```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "input_url": "https://example.com/video.mp4",
    "model": "volcano-vision",
    "user_id": "user_001",
    "session_id": "session_001",
    "prompt": "描述视频里发生了什么",
    "sync": "true"
  }'
```

> 视频会抽取关键帧，用视觉模型分析

---

### 7. 列表查询

```bash
# 查询某用户的全部任务
curl "http://localhost:3000/api/v1/tasks?user_id=user_001&page=1&page_size=10" \
  -H "Authorization: Bearer test-key"

# 按状态筛选
curl "http://localhost:3000/api/v1/tasks?status=completed&page=1" \
  -H "Authorization: Bearer test-key"
```

---

### 8. SSE 实时推送（可选）

客户端建立 SSE 连接，实时接收任务状态变更：

```bash
curl -N "http://localhost:3000/api/v1/sse?user_id=user_001" \
  -H "Authorization: Bearer test-key"
```

> 当任务状态变为 completed/failed 时，服务端推送事件

---

### 9. 指定输入类型（跳过自动检测）

如果 URL 的 HEAD 检测失败，可以显式指定 `input_type`：

```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "input_url": "https://some-weird-url",
    "input_type": "link",
    "model": "volcano-text",
    "sync": "true"
  }'
```

可选值：`image` | `video` | `audio` | `link`

---

## 支持的模型

| model | 类型 | 说明 |
|-------|------|------|
| `volcano-text` | text | 文本模型，处理链接/纯文本 |
| `volcano-vision` | vision | 视觉模型，处理图片/视频/链接 |

```bash
# 查询可用模型列表
curl http://localhost:3000/api/v1/models \
  -H "Authorization: Bearer test-key"
```

---

## 任务状态流转

```
pending -> processing -> completed
                   -> failed (重试3次)
```

任务失败会自动重试，最多 3 次，间隔指数退避（2s, 4s, 8s）。
