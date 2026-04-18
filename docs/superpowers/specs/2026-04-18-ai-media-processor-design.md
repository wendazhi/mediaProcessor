# AI Media Processor - 设计文档

## 1. 概述

一个 REST API 服务，接收图片、视频、音频、链接等内容，通过 AI 模型进行解析并生成结构化解读。

### 核心特性
- 支持多种输入类型：图片、视频、音频、链接
- 支持多 AI 模型切换（Claude、GPT、Gemini 等）
- 同步/异步双模式 RESTful 接口
- SSE 实时推送（一期）
- WebSocket 预留（二期）
- 水平可扩展的 Worker 架构
- 最小化中间件依赖，仅使用 PostgreSQL

---

## 2. 架构设计

### 2.1 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                        API Server                             │
│  (Node.js / TypeScript / Fastify)                            │
│  - 接收请求、校验参数                                          │
│  - 类型推断 (TypeResolver)：自动识别输入媒体类型                │
│  - 同步模式：挂起等待结果（RESTful）                            │
│  - 异步模式：返回 task_id（RESTful）                            │
│  - SSE：实时推送任务状态（一期）                                │
│  - WebSocket：预留（二期）                                      │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│                    PostgreSQL                                 │
│  tasks 表（存储任务数据 + 充当队列）                            │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│                      Worker Pool                              │
│  (多实例，通过 FOR UPDATE SKIP LOCKED 并发取任务)              │
│  - 任务调度器 (TaskDispatcher)                                │
│  - HandlerFactory (按 input_type 分发)                        │
│  - Model Adapter (统一 AI 模型接口)                           │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 设计原则

1. **统一任务管道**：同步/异步共享完全相同的处理逻辑，区别仅在 API 层的响应方式
2. **数据库即队列**：使用 PostgreSQL 替代 Redis/MQ，降低初期运维成本
3. **模型可插拔**：通过 Adapter 模式封装不同 AI 模型，上层无感知切换
4. **按媒体类型分层**：不同媒体类型走不同 HandlerFactory 预处理，再调用对应 Model Adapter
5. **自动类型推断**：用户可以不指定 input_type，系统从输入内容自动识别

---

## 2.3 项目目录结构

```
media-processor/
├── src/
│   ├── api/                    # API 层
│   │   ├── routes/
│   │   │   ├── tasks.ts        # 任务相关路由
│   │   │   ├── models.ts       # 模型列表路由
│   │   │   └── sse.ts          # SSE 推送路由
│   │   ├── middleware/
│   │   │   ├── auth.ts         # API Key 认证
│   │   │   ├── error-handler.ts # 全局错误处理
│   │   │   └── rate-limit.ts   # 限流中间件
│   │   └── server.ts           # Fastify 实例初始化
│   │
│   ├── core/                   # 核心业务层
│   │   ├── type-resolver.ts    # 输入类型推断器
│   │   ├── task-service.ts     # 任务服务（创建/查询）
│   │   ├── sync-waiter.ts      # 同步请求等待器
│   │   └── sse-manager.ts      # SSE 连接管理
│   │
│   ├── worker/                 # Worker 处理层
│   │   ├── worker.ts           # Worker 主循环
│   │   ├── task-dispatcher.ts  # 任务调度器
│   │   ├── handlers/
│   │   │   ├── image-handler.ts
│   │   │   ├── video-handler.ts
│   │   │   ├── audio-handler.ts
│   │   │   └── link-handler.ts
│   │   └── media/
│   │       ├── image-processor.ts
│   │       ├── video-processor.ts
│   │       ├── audio-processor.ts
│   │       └── link-fetcher.ts
│   │
│   ├── model/                  # AI 模型层
│   │   ├── model-registry.ts   # 模型注册表
│   │   ├── adapters/
│   │   │   ├── vision/
│   │   │   │   ├── claude-adapter.ts
│   │   │   │   ├── gpt-adapter.ts
│   │   │   │   └── gemini-adapter.ts
│   │   │   ├── text/
│   │   │   │   ├── claude-text-adapter.ts
│   │   │   │   └── gpt-text-adapter.ts
│   │   │   └── audio/
│   │   │       └── whisper-adapter.ts
│   │   └── types.ts            # 模型接口定义
│   │
│   ├── db/                     # 数据库层
│   │   ├── schema.ts           # Drizzle 表定义
│   │   ├── client.ts           # 数据库连接
│   │   └── queue.ts            # 队列操作封装
│   │
│   ├── config/                 # 配置层
│   │   └── index.ts            # 环境变量与配置
│   │
│   └── types/                  # 共享类型
│       └── index.ts
│
├── migrations/                 # 数据库迁移文件
├── scripts/
│   └── start-worker.ts         # Worker 启动脚本
├── docker-compose.yml
├── Dockerfile
└── package.json
```

---

## 3. 数据库设计

### 3.1 tasks 表

```sql
CREATE TABLE tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR(64),
                -- 用户标识（如用户ID、设备ID等）
  session_id    VARCHAR(64),
                -- 会话标识，用于区分同一会话内的任务
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
                -- pending | processing | completed | failed
  input_type    VARCHAR(20) NOT NULL,
                -- image | video | audio | link
  input_data    JSONB NOT NULL,
                -- { url: string } | { file_path: string, mime_type: string }
  result        JSONB,
                -- { text: string, structured?: object, usage?: object }
  model         VARCHAR(50) NOT NULL,
                -- claude-sonnet-4-6 | gpt-4o | gemini-2.0-flash | ...
  prompt        TEXT,
                -- 用户自定义 prompt，为空使用默认
  error         TEXT,
                -- 失败时的错误信息
  sync_request  BOOLEAN NOT NULL DEFAULT false,
                -- 标记是否为同步请求（用于通知机制）
  retry_count   INT NOT NULL DEFAULT 0,
                -- 已重试次数
  max_retries   INT NOT NULL DEFAULT 3,
                -- 最大重试次数
  next_retry_at TIMESTAMPTZ,
                -- 下次重试时间（用于指数退避）
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_user_created ON tasks(user_id, created_at DESC);
CREATE INDEX idx_tasks_session ON tasks(session_id, created_at DESC);

CREATE INDEX idx_tasks_status_created ON tasks(status, created_at);
CREATE INDEX idx_tasks_next_retry ON tasks(status, next_retry_at) WHERE status = 'pending';
```

### 3.2 任务状态流转

```
pending ──▶ processing ──▶ completed
                    └────▶ failed
```

---

## 4. API 设计

### 4.1 统一响应格式

所有 API 响应统一包裹在标准结构中：

**成功响应：**

```json
{
  "code": 200,
  "data": { ... },
  "message": "success"
}
```

**错误响应：**

```json
{
  "code": 400,
  "data": null,
  "message": "Invalid input type"
}
```

### 4.2 创建任务

```http
POST /api/v1/tasks
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | C | 上传的文件（图片/视频/音频） |
| input_url | string | C | 链接地址（图片/视频/网页） |
| input_type | string | 否 | image / video / audio / link，不传则自动推断 |
| model | string | 是 | 模型 ID |
| prompt | string | 否 | 自定义解读提示 |
| user_id | string | 否 | 用户标识，用于任务归属和查询 |
| session_id | string | 否 | 会话标识，用于区分同一会话内的任务 |
| sync | boolean | 否 | 是否同步等待（默认 false） |
| timeout | number | 否 | 同步超时时间（默认 30，最大 120） |

> 注：file 和 input_url 至少提供其一

**Content-Type 说明：**
- 上传文件：`multipart/form-data`
- 仅传 URL：`application/json`

**响应（异步模式）：**

```json
{
  "code": 200,
  "data": {
    "task_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "user_123",
    "session_id": "session_abc",
    "status": "pending",
    "created_at": "2026-04-18T10:30:00Z"
  },
  "message": "success"
}
```

**响应（同步模式 - 成功）：**

```json
{
  "code": 200,
  "data": {
    "task_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "user_123",
    "session_id": "session_abc",
    "status": "completed",
    "input_type": "image",
    "model": "claude-sonnet-4-6",
    "result": {
      "text": "这是一张日落照片，天空呈现橙红色...",
      "structured": {
        "objects": ["太阳", "海洋", "天空"],
        "mood": "宁静",
        "tags": ["风景", "自然"]
      },
      "usage": { "tokens": 512 }
    },
    "created_at": "2026-04-18T10:30:00Z",
    "completed_at": "2026-04-18T10:30:12Z"
  },
  "message": "success"
}
```

**响应（同步模式 - 超时）：**

```json
{
  "code": 200,
  "data": {
    "task_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "user_123",
    "session_id": "session_abc",
    "status": "processing",
    "message": "Task is still processing, use task_id to query later",
    "created_at": "2026-04-18T10:30:00Z"
  },
  "message": "success"
}
```

### 4.3 查询任务

```http
GET /api/v1/tasks/:task_id
```

**响应：**

```json
{
  "code": 200,
  "data": {
    "task_id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "user_123",
    "session_id": "session_abc",
    "status": "completed",
    "input_type": "image",
    "model": "claude-sonnet-4-6",
    "result": {
      "text": "这是一张日落照片...",
      "structured": { ... },
      "usage": { "tokens": 512 }
    },
    "created_at": "2026-04-18T10:30:00Z",
    "completed_at": "2026-04-18T10:30:12Z"
  },
  "message": "success"
}
```

### 4.4 任务列表查询

```http
GET /api/v1/tasks?user_id=xxx&session_id=xxx&page=1&page_size=20&status=completed
```

**查询参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_id | string | 否 | 按用户过滤 |
| session_id | string | 否 | 按会话过滤 |
| page | number | 否 | 页码（默认 1） |
| page_size | number | 否 | 每页条数（默认 20，最大 100） |
| status | string | 否 | 按状态过滤 |

**响应：**

```json
{
  "code": 200,
  "data": {
    "items": [
      {
        "task_id": "550e8400-e29b-41d4-a716-446655440000",
        "user_id": "user_123",
        "session_id": "session_abc",
        "status": "completed",
        "input_type": "image",
        "model": "claude-sonnet-4-6",
        "created_at": "2026-04-18T10:30:00Z"
      }
    ],
    "total": 100,
    "page": 1,
    "page_size": 20
  },
  "message": "success"
}
```

### 4.5 获取可用模型列表

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
        "id": "claude-sonnet-4-6",
        "type": "vision",
        "supports": ["image", "video", "link"]
      },
      {
        "id": "gpt-4o",
        "type": "vision",
        "supports": ["image", "video"]
      },
      {
        "id": "gemini-2.0-flash",
        "type": "vision",
        "supports": ["image", "video", "link"]
      }
    ]
  },
  "message": "success"
}
```

### 4.6 SSE 实时推送（一期）

```
GET /api/v1/tasks/:task_id/stream
Content-Type: text/event-stream
```

**建立 SSE 连接后，服务端主动推送任务状态更新：**

```
event: status_change
data: {"task_id":"550e8400-...","status":"processing","updated_at":"2026-04-18T10:30:05Z"}

event: completed
data: {"task_id":"550e8400-...","status":"completed","result":{"text":"这是一张日落照片...","structured":{...}}}
```

**失败时推送：**

```
event: failed
data: {"task_id":"550e8400-...","status":"failed","error":"Model API rate limit exceeded"}
```

**客户端使用示例：**

```javascript
const evtSource = new EventSource('/api/v1/tasks/xxx/stream');
evtSource.addEventListener('completed', (e) => {
  const data = JSON.parse(e.data);
  console.log('Task completed:', data.result);
  evtSource.close();
});
evtSource.addEventListener('failed', (e) => {
  const data = JSON.parse(e.data);
  console.error('Task failed:', data.error);
  evtSource.close();
});
```

### 4.7 WebSocket（二期预留）

WebSocket 接口预留，用于后续支持双向通信场景（如流式 AI 输出）。接口地址：

```
ws://host/ws/tasks/:task_id
```

---

## 5. 处理层设计

### 5.0 TypeResolver（类型推断层）

API Server 在创建任务时，如果用户未提供 `input_type`，通过 `TypeResolver` 自动推断：

```
输入内容
  │
  ├──▶ URL 格式？ ──yes──▶ HTTP HEAD 请求获取 Content-Type
  │                          │
  │                          ├──▶ image/*    ──▶ input_type = image
  │                          ├──▶ video/*    ──▶ input_type = video
  │                          ├──▶ audio/*    ──▶ input_type = audio
  │                          ├──▶ text/html  ──▶ input_type = link
  │                          └──▶ 其他        ──▶ 尝试 URL 后缀匹配
  │
  └──▶ 文件上传？ ──yes──▶ 读取文件 magic bytes
                             │
                             ├──▶ 0xFF 0xD8 (JPEG)   ──▶ image
                             ├──▶ 0x89 0x50 (PNG)    ──▶ image
                             ├──▶ 0x66 0x74 (MP4)    ──▶ video
                             ├──▶ ID3 / fLaC / RIFF  ──▶ audio
                             └──▶ 未知               ──▶ 400 错误
```

**推断策略优先级：**

| 优先级 | 策略 | 说明 |
|--------|------|------|
| 1 | 用户显式指定 | `input_type` 参数 |
| 2 | URL Content-Type | 对外部链接发送 HEAD 请求 |
| 3 | 文件 Magic Bytes | 读取文件头字节判断真实格式 |
| 4 | URL 后缀 | `.jpg` `.mp4` `.mp3` 等 |
| 5 | 失败 | 无法识别时返回 400 错误 |

**推断完成后写入 `tasks.input_type`，后续流程完全一致。**

### 5.1 Worker 消费机制

Worker 使用 PostgreSQL `FOR UPDATE SKIP LOCKED` 实现并发安全取任务：

```sql
-- Worker 取任务（含重试条件）
BEGIN;
SELECT id, input_type, input_data, model, prompt
FROM tasks
WHERE status = 'pending'
  AND (next_retry_at IS NULL OR next_retry_at <= NOW())
ORDER BY created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 1;

-- 更新为 processing
UPDATE tasks SET status = 'processing', updated_at = NOW()
WHERE id = :task_id;
COMMIT;
```

**Worker 执行流程：**

1. 从数据库取 `pending` 任务（含重试条件：任务需在 `next_retry_at` 时间之后）
2. 更新 `status = 'processing'`
3. 根据 `input_type` 调用对应 `HandlerFactory`
4. `HandlerFactory` 执行媒体预处理
5. 调用 `ModelAdapter` 执行 AI 解析
6. 成功：将结果回写 `tasks` 表，`status = 'completed'`
7. 失败：
   - `retry_count < max_retries`：更新 `status = 'pending'`，`retry_count += 1`，计算 `next_retry_at`（指数退避），稍后重试
   - `retry_count >= max_retries`：更新 `status = 'failed'`，记录错误信息
8. 触发状态变更通知（PostgreSQL NOTIFY）

### 5.2 HandlerFactory 分层

根据 `input_type` 分发到对应处理器：

| 处理器 | 输入 | 预处理 | 调用模型 |
|--------|------|--------|----------|
| `ImageHandlerFactory` | 图片文件/URL | 压缩、格式转换、Base64 编码 | VisionModelAdapter |
| `VideoHandlerFactory` | 视频文件/URL | 抽帧（场景切换/均匀采样）| VisionModelAdapter |
| `AudioHandlerFactory` | 音频文件/URL | 转码、语音转文本（如需要）| AudioModelAdapter / TextModelAdapter |
| `LinkHandlerFactory` | 网页 URL | 抓取页面、提取正文内容 | TextModelAdapter |

### 5.2.1 LinkHandler 详细设计

`LinkHandlerFactory` 专门处理 URL 类型的输入，流程如下：

```
输入 URL
  │
  ├──▶ 1. URL 安全校验（SSRF 防护）
  │      - 禁止内网地址（192.168.x.x, 10.x.x.x, 127.0.0.1 等）
  │      - 禁止非 HTTP/HTTPS 协议
  │      - 校验 URL 格式
  │
  ├──▶ 2. 平台识别与短链展开
  │      - 识别平台域名（抖音、小红书、微博、B站等）
  │      - 跟随短链/分享链重定向获取真实 URL
  │      - 最多跟随 5 次重定向
  │
  ├──▶ 3. 选择抓取策略
  │      ├──▶ 普通网页 ──▶ 直接 HTTP 请求（cheerio 解析）
  │      ├──▶ 社交媒体/动态页面 ──▶ 无头浏览器渲染（Playwright）
  │      └──▶ 直接媒体文件 ──▶ 转交对应 Handler
  │
  ├──▶ 4. 内容提取
  │      ├──▶ 普通网页 ──▶ cheerio 提取正文
  │      ├──▶ 社交媒体 ──▶ Playwright 渲染后提取
  │      └──▶ 媒体文件 ──▶ 下载后转交对应 Handler
  │
  ├──▶ 5. 内容截断（Token 限制）
  │      - 超过模型限制时从头部截断
  │      - 记录 "content_truncated": true
  │
  └──▶ 6. 调用对应 ModelAdapter
         - 图文内容 → TextModelAdapter
         - 视频内容 → VideoModelAdapter（提取关键帧）
```

**抓取策略选择器：**

| 场景 | 工具 | 说明 |
|------|------|------|
| 普通静态网页 | axios + cheerio | 轻量快速，无需渲染 |
| 社交媒体（抖音/小红书/微博）| Playwright | 需要 JS 渲染 |
| SPA 单页应用 | Playwright | 需要 JS 渲染 |
| 直接媒体文件 | axios 下载 | 转交对应 HandlerFactory |

**无头浏览器配置（Playwright）：**

```javascript
// Playwright 配置
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...'
});

// 等待页面加载完成
await page.goto(url, {
  waitUntil: 'networkidle',
  timeout: 30000
});

// 额外等待动态内容渲染（社交媒体）
await page.waitForTimeout(3000);

// 提取页面文本内容
const content = await page.evaluate(() => {
  // 移除脚本、样式等噪音
  document.querySelectorAll('script, style, nav, header, footer').forEach(el => el.remove());
  return document.body.innerText;
});
```

**平台专用提取规则（Playwright）：**

| 平台 | 选择器/策略 | 提取内容 |
|------|-------------|----------|
| 抖音 | `[data-e2e="video-desc"]` | 视频标题、描述 |
| 小红书 | `.note-content` | 笔记正文 |
| 微博 | `[node-type="feed_content"]` | 微博正文 |
| B站 | `#viewbox_report .video-title`, `.desc-info-text` | 标题+简介 |
| YouTube | `#title h1`, `#description-inline-expander` | 标题+描述 |

**平台识别与处理策略：**

| 平台 | 域名特征 | 内容类型 | 处理方式 |
|------|----------|----------|----------|
| 普通网页 | 任意 | 图文 | axios + cheerio 提取正文 |
| 抖音 | `douyin.com`, `iesdouyin.com`, `v.douyin.com` | 视频+文案 | Playwright 渲染提取 |
| 小红书 | `xiaohongshu.com`, `xhs.link` | 图文 | Playwright 渲染提取 |
| 微博 | `weibo.com`, `weibo.cn` | 图文/视频 | Playwright 渲染提取 |
| B站 | `bilibili.com`, `b23.tv` | 视频 | Playwright 渲染提取 |
| YouTube | `youtube.com`, `youtu.be` | 视频 | Playwright 渲染提取 |

**社交媒体内容提取：**

| 场景 | 处理方式 | 说明 |
|------|----------|------|
| 页面正常渲染 | Playwright 渲染后提取文案、标题 | 标准处理 |
| 页面要求登录 | 返回 `failed`，提示 "需要登录才能访问" | 暂不支持 |
| 内容提取为空 | 返回 `failed`，提示 "无法提取有效内容" | — |
| Playwright 启动失败 | 降级为 axios + cheerio 尝试提取 | 兜底方案 |

**正文提取策略优先级（普通网页）：**

| 优先级 | 策略 | 说明 |
|--------|------|------|
| 1 | `<article>` 标签 | 语义化文章区域 |
| 2 | `<meta name="description">` | 页面摘要 |
| 3 | `<main>` 标签 | 主内容区域 |
| 4 | 最大文本块算法 | 按文本密度找到最大连续文本区域 |
| 5 | `<body>` 全文 | 兜底方案 |

**安全限制：**

| 限制项 | 值 | 说明 |
|--------|-----|------|
| 禁止内网 | 是 | 防止 SSRF 攻击 |
| 禁止本地文件 | 是 | `file://` 协议拒绝 |
| 最大页面 | 5MB | 防止内存溢出 |
| 连接超时 | 10s | 防止挂起 |
| 读取超时 | 30s | 防止慢响应 |
| 最大重定向 | 5 次 | 防止重定向循环 |
| 必须 HTTPS | 推荐 | HTTP 链接警告但允许 |

### 5.3 Model Adapter 设计

统一接口封装不同 AI 模型：

```typescript
interface ModelAdapter {
  process(params: ProcessParams): Promise<ProcessResult>;
}

interface ProcessParams {
  type: 'image' | 'video' | 'audio' | 'text';
  content: string | string[];  // 预处理后的内容
  prompt?: string;
  options?: Record<string, any>;
}

interface ProcessResult {
  text: string;
  structured?: object;
  usage?: { tokens: number };
}
```

**模型类型映射：**

| 模型类型 | 说明 | 对应处理器 |
|----------|------|----------|
| `VisionModelAdapter` | 多模态视觉模型（Claude/GPT-4o/Gemini）| ImageHandlerFactory, VideoHandlerFactory |
| `AudioModelAdapter` | 音频专用模型（Whisper 等）| AudioHandlerFactory |
| `TextModelAdapter` | 纯文本模型（GPT-4/Claude Text）| LinkHandlerFactory, AudioHandlerFactory（转文本后）|

---

## 6. 通知机制

### 6.1 PostgreSQL NOTIFY

Worker 完成任务后触发数据库通知：

```sql
-- Worker 更新结果后
NOTIFY task_status_change, '{"task_id": "xxx", "status": "completed"}';
```

### 6.2 API Server 监听处理

API Server 建立 LISTEN 连接，收到通知后：

1. **同步请求**：唤醒挂起的请求，返回结果
2. **SSE 连接**：查找对应 `task_id` 的 SSE 响应流，推送事件
3. **轮询用户**：无动作，用户下次轮询时获取结果

---

## 7. 技术栈

| 组件 | 技术选型 |
|------|----------|
| 运行时 | Node.js 22+ |
| 语言 | TypeScript |
| API 框架 | Fastify |
| 数据库 | PostgreSQL 15+ |
| ORM/查询 | Drizzle ORM 或 pg 原生 |
| 队列 | PostgreSQL `FOR UPDATE SKIP LOCKED` |
| 实时推送 | SSE (Server-Sent Events) |
| 任务调度 | node-cron / setInterval |
| 无头浏览器 | Playwright（Chromium）|
| 视频处理 | ffmpeg（child_process 调用）|
| 部署 | Docker / Docker Compose |

---

## 8. 部署架构（初期）

```
┌─────────────────────────────────────────────┐
│              Docker Compose                  │
│                                              │
│  ┌─────────────┐    ┌─────────────────────┐ │
│  │ API Server  │    │   PostgreSQL        │ │
│  │ (1 instance)│◀──▶│   (1 instance)      │ │
│  └─────────────┘    └─────────────────────┘ │
│         │                                    │
│  ┌──────▼──────┐                             │
│  │   Worker    │                             │
│  │ (1-N inst.) │                             │
│  └─────────────┘                             │
└─────────────────────────────────────────────┘
```

**水平扩展方式：** 增加 Worker 实例数量，共享同一个 PostgreSQL。

---

## 9. 错误处理

| 场景 | 处理方式 |
|------|----------|
| AI 模型 API 超时/失败 | 重试 `max_retries` 次（默认 3 次，指数退避），最终标记 `failed` |
| 媒体下载失败 | 直接标记 `failed`，error 字段记录原因 |
| 不支持的文件格式 | API 层直接返回 400，不创建任务 |
| Worker 崩溃 | 启动时扫描 `processing` 超过 5 分钟的任务，重置为 `pending` |
| 同步请求超时 | 返回 `status: processing` + `task_id`，用户后续查询 |

### 9.1 重试策略

**可重试的错误类型：**
- AI 模型 API 超时或临时不可用
- 网络波动导致的下载失败

**不可重试的错误类型：**
- 不支持的文件格式
- Prompt 注入或参数校验失败
- AI 模型明确拒绝（如内容政策限制）

**指数退避公式：**
```
next_retry_at = NOW() + (2 ^ retry_count) 秒
```
- 第 1 次重试：等待 2 秒
- 第 2 次重试：等待 4 秒
- 第 3 次重试：等待 8 秒

**Worker 取任务 SQL 已包含重试条件：**
```sql
WHERE status = 'pending'
  AND (next_retry_at IS NULL OR next_retry_at <= NOW())
```

---

## 10. 安全考虑

1. **文件上传限制**：单文件最大 100MB，限制 MIME 类型
2. **URL 访问**：请求外部 URL 时设置超时和重试限制，防止 SSRF
3. **API 认证**：初期使用 API Key（`Authorization: Bearer <key>`）
4. **Prompt 注入**：用户自定义 prompt 需做基本过滤，避免模型越狱
5. **资源隔离**：Worker 处理超时任务（单任务最大执行时间 10 分钟）


---
