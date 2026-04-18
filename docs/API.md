# AI Media Processor - API 对接文档

> 版本：v1.0.0
> 基础地址：`http://your-host:3000`
> 协议：RESTful + JSON

---

## 一、能力总览

| 能力 | 说明 |
|------|------|
| **链接解析** | 抓取网页/HTML 内容，提取文本给 AI 分析 |
| **图片分析** | 支持图片 URL 或 Base64，调用视觉模型生成解读 |
| **视频分析** | 下载视频，抽取关键帧，用视觉模型分析 |
| **音频分析** | 预留（待接入 Whisper 等音频模型） |
| **同步等待** | `sync=true` 时接口阻塞，任务完成后直接返回结果 |
| **异步回调** | 默认异步，通过 task_id 轮询或 SSE 接收状态变更 |
| **自动类型识别** | 通过 URL 的 Content-Type 或扩展名自动判断输入类型 |
| **重试机制** | 失败自动重试 3 次，指数退避（2s, 4s, 8s） |
| **多模型切换** | 支持 Volcano 文本/视觉模型，可扩展 GPT/Claude/Gemini |

---

## 二、通用规范

### 2.1 鉴权

所有接口需在 Header 中携带 API Key：

```
Authorization: Bearer {API_KEY}
Content-Type: application/json
```

### 2.2 响应格式

```json
{
  "code": 200,
  "data": { ... },
  "message": "success"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | number | HTTP 状态码，200 为成功 |
| `data` | object | 业务数据 |
| `message` | string | 提示信息 |

### 2.3 错误码

| code | 含义 |
|------|------|
| 400 | 参数错误 |
| 401 | 鉴权失败 |
| 404 | 任务不存在 |
| 500 | 服务端错误 |

---

## 三、接口详情

### 3.1 创建任务

```http
POST /api/v1/tasks
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `input_url` | string | 是 | 输入 URL（图片/视频/音频/网页）或 Base64 data URI |
| `input_type` | string | 否 | 显式指定类型：`image` / `video` / `audio` / `link`，不填则自动识别 |
| `model` | string | 是 | 模型 ID，见[可用模型](#35-查询可用模型) |
| `prompt` | string | 否 | 自定义提示词，不填使用默认值 |
| `user_id` | string | 否 | 用户标识，用于关联查询 |
| `session_id` | string | 否 | 会话标识，用于关联查询 |
| `sync` | string | 否 | `"true"` 开启同步阻塞模式，默认异步 |
| `timeout` | string | 否 | 同步超时秒数，默认 30，最大 120 |

**异步请求示例：**

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

**异步响应：**

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

**同步请求示例：**

```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "input_url": "https://www.volcengine.com/docs/82379/1362931",
    "model": "volcano-text",
    "user_id": "user_001",
    "session_id": "session_001",
    "prompt": "请用一句话总结",
    "sync": "true",
    "timeout": "60"
  }'
```

**同步成功响应：**

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
      "usage": { "tokens": 668 }
    },
    "created_at": "2026-04-18T12:00:00.000Z",
    "completed_at": "2026-04-18T12:00:17.000Z"
  },
  "message": "success"
}
```

**同步超时响应（任务仍在处理中）：**

```json
{
  "code": 200,
  "data": {
    "task_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "user_001",
    "session_id": "session_001",
    "status": "processing",
    "message": "Task is still processing, use task_id to query later",
    "created_at": "2026-04-18T12:00:00.000Z"
  },
  "message": "success"
}
```

---

### 3.2 查询任务结果

```http
GET /api/v1/tasks/{task_id}
```

**响应：**

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
      "text": "...",
      "usage": { "tokens": 668 }
    },
    "error": null,
    "created_at": "2026-04-18T12:00:00.000Z",
    "completed_at": "2026-04-18T12:00:17.000Z"
  },
  "message": "success"
}
```

---

### 3.3 列表查询

```http
GET /api/v1/tasks?user_id={user_id}&session_id={session_id}&status={status}&page={page}&page_size={page_size}
```

**查询参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `user_id` | string | 否 | 按用户筛选 |
| `session_id` | string | 否 | 按会话筛选 |
| `status` | string | 否 | 按状态筛选：`pending` / `processing` / `completed` / `failed` |
| `page` | number | 否 | 页码，默认 1 |
| `page_size` | number | 否 | 每页条数，默认 20，最大 100 |

**响应：**

```json
{
  "code": 200,
  "data": {
    "items": [
      {
        "task_id": "550e8400-e29b-41d4-a716-446655440000",
        "user_id": "user_001",
        "session_id": "session_001",
        "status": "completed",
        "input_type": "link",
        "model": "volcano-text",
        "created_at": "2026-04-18T12:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 20
  },
  "message": "success"
}
```

---

### 3.4 SSE 实时推送

建立 SSE 长连接，实时接收任务状态变更。

```http
GET /api/v1/sse?user_id={user_id}
```

**事件格式：**

```
event: task_update
data: {"task_id":"xxx","status":"completed","result":{...}}
```

**curl 示例：**

```bash
curl -N "http://localhost:3000/api/v1/sse?user_id=user_001" \
  -H "Authorization: Bearer test-key"
```

---

### 3.5 查询可用模型

```http
GET /api/v1/models
```

**响应：**

```json
{
  "code": 200,
  "data": {
    "models": [
      {
        "id": "volcano-text",
        "type": "text",
        "supports": ["link"]
      },
      {
        "id": "volcano-vision",
        "type": "vision",
        "supports": ["image", "video", "link"]
      }
    ]
  },
  "message": "success"
}
```

---

## 四、典型场景示例

### 4.1 分析网页链接

```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "input_url": "https://www.volcengine.com/docs/82379/1362931",
    "model": "volcano-text",
    "prompt": "请总结这个页面的主要内容",
    "sync": "true"
  }'
```

### 4.2 分析图片（URL）

```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "input_url": "https://example.com/photo.jpg",
    "model": "volcano-vision",
    "prompt": "请详细描述这张图片的内容",
    "sync": "true"
  }'
```

### 4.3 分析图片（Base64）

```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "input_url": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "model": "volcano-vision",
    "prompt": "描述这张图片",
    "sync": "true"
  }'
```

### 4.4 分析视频

```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "input_url": "https://example.com/video.mp4",
    "model": "volcano-vision",
    "prompt": "描述视频里发生了什么",
    "sync": "true"
  }'
```

### 4.5 异步模式 + 轮询结果

```bash
# 1. 创建任务（异步）
TASK_ID=$(curl -s -X POST http://localhost:3000/api/v1/tasks \
  -H "Authorization: Bearer test-key" \
  -H "Content-Type: application/json" \
  -d '{"input_url":"https://example.com/page","model":"volcano-text"}' \
  | jq -r '.data.task_id')

# 2. 轮询结果
while true; do
  STATUS=$(curl -s "http://localhost:3000/api/v1/tasks/$TASK_ID" \
    -H "Authorization: Bearer test-key" | jq -r '.data.status')
  echo "Status: $STATUS"
  [ "$STATUS" = "completed" ] && break
  [ "$STATUS" = "failed" ] && break
  sleep 2
done
```

---

## 五、任务状态说明

```
  pending ──> processing ──> completed
       │           │
       └────> failed (重试3次后)
```

| 状态 | 说明 |
|------|------|
| `pending` | 已创建，等待 Worker 消费 |
| `processing` | Worker 正在处理 |
| `completed` | 处理完成，`result` 字段有数据 |
| `failed` | 处理失败，`error` 字段有错误信息 |

---

## 六、输入类型说明

| 类型 | 输入示例 | 处理方式 |
|------|---------|---------|
| `link` | `https://example.com/article` | Playwright 抓取网页文本，交给文本模型 |
| `image` | `https://example.com/photo.jpg` 或 `data:image/jpeg;base64,...` | 下载图片转 base64，交给视觉模型 |
| `video` | `https://example.com/video.mp4` | 下载视频，抽帧转 base64，交给视觉模型 |
| `audio` | `https://example.com/audio.mp3` | 预留，待接入音频模型 |

**类型识别优先级：**
1. 显式 `input_type` 参数
2. Base64 data URI 的 mime type
3. URL HEAD 请求的 Content-Type
4. URL 扩展名后缀
5. 默认按 `link` 处理

---

## 七、扩展模型

模型通过 Adapter 模式接入，新增模型只需实现 `ModelAdapter` 接口并注册即可。

当前支持的模型：

| 模型 ID | 类型 | 支持输入 | 说明 |
|---------|------|---------|------|
| `volcano-text` | text | link | 火山引擎文本模型 |
| `volcano-vision` | vision | image, video, link | 火山引擎视觉模型 |

未来可扩展：`claude-sonnet-4-6`、`gpt-4o`、`gemini-pro` 等。
