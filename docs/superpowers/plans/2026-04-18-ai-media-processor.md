# AI Media Processor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a REST API service that receives images, videos, audio, and links, then uses AI models to generate structured interpretations.

**Architecture:** Fastify API server with PostgreSQL for data+queue, background workers using FOR UPDATE SKIP LOCKED, pluggable AI model adapters, and SSE for real-time push.

**Tech Stack:** Node.js 22+, TypeScript, Fastify, Drizzle ORM, PostgreSQL 15+, Playwright, ffmpeg

---

## File Structure

```
media-processor/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── tasks.ts
│   │   │   ├── models.ts
│   │   │   └── sse.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── error-handler.ts
│   │   │   └── rate-limit.ts
│   │   └── server.ts
│   ├── core/
│   │   ├── type-resolver.ts
│   │   ├── task-service.ts
│   │   ├── sync-waiter.ts
│   │   └── sse-manager.ts
│   ├── worker/
│   │   ├── worker.ts
│   │   ├── task-dispatcher.ts
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
│   ├── model/
│   │   ├── model-registry.ts
│   │   ├── adapters/
│   │   │   ├── vision/
│   │   │   │   └── claude-adapter.ts
│   │   │   └── text/
│   │   │       └── claude-text-adapter.ts
│   │   └── types.ts
│   ├── db/
│   │   ├── schema.ts
│   │   ├── client.ts
│   │   └── queue.ts
│   ├── config/
│   │   └── index.ts
│   └── types/
│       └── index.ts
├── tests/
├── migrations/
├── scripts/
│   └── start-worker.ts
├── docker-compose.yml
├── Dockerfile
├── tsconfig.json
└── package.json
```

---

### Task 1: Project Initialization

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "ai-media-processor",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/api/server.ts",
    "dev:worker": "tsx watch scripts/start-worker.ts",
    "build": "tsc",
    "start": "node dist/api/server.js",
    "start:worker": "node dist/scripts/start-worker.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "test": "vitest"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "@fastify/multipart": "^9.0.0",
    "@fastify/websocket": "^11.0.0",
    "drizzle-orm": "^0.38.0",
    "pg": "^8.13.0",
    "dotenv": "^16.4.0",
    "zod": "^3.24.0",
    "axios": "^1.7.0",
    "cheerio": "^1.0.0",
    "playwright": "^1.49.0",
    "sharp": "^0.33.0",
    "fluent-ffmpeg": "^2.1.3",
    "@anthropic-ai/sdk": "^0.32.0",
    "uuid": "^11.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/pg": "^8.11.0",
    "@types/fluent-ffmpeg": "^2.1.27",
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "drizzle-kit": "^0.30.0",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*", "scripts/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create .env.example**

```
# Server
PORT=3000
API_KEY=your-api-key-here

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/media_processor

# AI Models
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
GEMINI_API_KEY=your-gemini-key

# Worker
WORKER_POLL_INTERVAL_MS=1000
WORKER_MAX_CONCURRENT=5
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: packages installed in node_modules

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json .env.example
git commit -m "chore: project initialization"
```

---

### Task 2: Database Schema & Client

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/client.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 1: Write the schema**

```typescript
import { pgTable, uuid, varchar, text, jsonb, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 64 }),
  sessionId: varchar("session_id", { length: 64 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  inputType: varchar("input_type", { length: 20 }).notNull(),
  inputData: jsonb("input_data").notNull(),
  result: jsonb("result"),
  model: varchar("model", { length: 50 }).notNull(),
  prompt: text("prompt"),
  error: text("error"),
  syncRequest: boolean("sync_request").notNull().default(false),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
```

- [ ] **Step 2: Create database client**

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
export { schema };
```

- [ ] **Step 3: Create drizzle config**

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 4: Generate and run migrations**

Run:
```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

- [ ] **Step 5: Commit**

```bash
git add src/db/ drizzle.config.ts migrations/
git commit -m "feat: database schema and client"
```

---

### Task 3: Core Types & Config

**Files:**
- Create: `src/types/index.ts`
- Create: `src/config/index.ts`

- [ ] **Step 1: Write core types**

```typescript
export type InputType = "image" | "video" | "audio" | "link";
export type TaskStatus = "pending" | "processing" | "completed" | "failed";

export interface TaskResult {
  text: string;
  structured?: Record<string, unknown>;
  usage?: { tokens: number };
}

export interface ProcessParams {
  type: InputType;
  content: string | string[];
  prompt?: string;
  options?: Record<string, unknown>;
}

export interface ProcessResult {
  text: string;
  structured?: Record<string, unknown>;
  usage?: { tokens: number };
}

export interface ModelInfo {
  id: string;
  type: "vision" | "audio" | "text";
  supports: InputType[];
}

export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}
```

- [ ] **Step 2: Write config**

```typescript
import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000"),
  apiKey: process.env.API_KEY || "",
  databaseUrl: process.env.DATABASE_URL || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  workerPollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || "1000"),
  workerMaxConcurrent: parseInt(process.env.WORKER_MAX_CONCURRENT || "5"),
  maxFileSize: 100 * 1024 * 1024, // 100MB
  taskTimeoutMs: 10 * 60 * 1000, // 10 minutes
  syncTimeoutDefault: 30,
  syncTimeoutMax: 120,
} as const;
```

- [ ] **Step 3: Commit**

```bash
git add src/types/ src/config/
git commit -m "feat: core types and config"
```

---

### Task 4: Model Adapter Interface & Registry

**Files:**
- Create: `src/model/types.ts`
- Create: `src/model/model-registry.ts`

- [ ] **Step 1: Write adapter types**

```typescript
import { InputType, ProcessResult } from "../types/index.js";

export interface ModelAdapter {
  readonly modelId: string;
  readonly modelType: "vision" | "audio" | "text";
  readonly supports: InputType[];
  process(params: {
    type: InputType;
    content: string | string[];
    prompt?: string;
  }): Promise<ProcessResult>;
}
```

- [ ] **Step 2: Write model registry**

```typescript
import { ModelAdapter } from "./types.js";
import { InputType } from "../types/index.js";

const adapters = new Map<string, ModelAdapter>();

export function registerAdapter(adapter: ModelAdapter): void {
  adapters.set(adapter.modelId, adapter);
}

export function getAdapter(modelId: string): ModelAdapter | undefined {
  return adapters.get(modelId);
}

export function getAllAdapters(): ModelAdapter[] {
  return Array.from(adapters.values());
}

export function findAdaptersForType(inputType: InputType): ModelAdapter[] {
  return getAllAdapters().filter((a) => a.supports.includes(inputType));
}

export function getAvailableModels() {
  return getAllAdapters().map((a) => ({
    id: a.modelId,
    type: a.modelType,
    supports: a.supports,
  }));
}
```

- [ ] **Step 3: Commit**

```bash
git add src/model/
git commit -m "feat: model adapter interface and registry"
```

---

### Task 5: Claude Model Adapter

**Files:**
- Create: `src/model/adapters/vision/claude-adapter.ts`
- Create: `src/model/adapters/text/claude-text-adapter.ts`

- [ ] **Step 1: Install Anthropic SDK**

Run: `npm install @anthropic-ai/sdk`

- [ ] **Step 2: Write vision adapter**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { ModelAdapter } from "../../types.js";
import { InputType, ProcessResult } from "../../../types/index.js";
import { config } from "../../../config/index.js";

export class ClaudeVisionAdapter implements ModelAdapter {
  readonly modelId = "claude-sonnet-4-6";
  readonly modelType = "vision" as const;
  readonly supports: InputType[] = ["image", "video", "link"];

  private client = new Anthropic({ apiKey: config.anthropicApiKey });

  async process(params: {
    type: InputType;
    content: string | string[];
    prompt?: string;
  }): Promise<ProcessResult> {
    const images = Array.isArray(params.content) ? params.content : [params.content];
    const userPrompt = params.prompt || "Describe this content in detail.";

    const content: Anthropic.Messages.ContentBlockParam[] = [
      { type: "text", text: userPrompt },
      ...images.map((img) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: "image/jpeg" as const,
          data: img,
        },
      })),
    ];

    const response = await this.client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      messages: [{ role: "user", content }],
    });

    const text = response.content
      .filter((c): c is Anthropic.Messages.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");

    return {
      text,
      usage: { tokens: response.usage?.input_tokens || 0 },
    };
  }
}
```

- [ ] **Step 3: Write text adapter**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { ModelAdapter } from "../../types.js";
import { InputType, ProcessResult } from "../../../types/index.js";
import { config } from "../../../config/index.js";

export class ClaudeTextAdapter implements ModelAdapter {
  readonly modelId = "claude-text";
  readonly modelType = "text" as const;
  readonly supports: InputType[] = ["link"];

  private client = new Anthropic({ apiKey: config.anthropicApiKey });

  async process(params: {
    type: InputType;
    content: string | string[];
    prompt?: string;
  }): Promise<ProcessResult> {
    const text = Array.isArray(params.content) ? params.content.join("\n") : params.content;
    const userPrompt = params.prompt || "Summarize and analyze this content.";

    const response = await this.client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `${userPrompt}\n\n${text}`,
        },
      ],
    });

    const resultText = response.content
      .filter((c): c is Anthropic.Messages.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");

    return {
      text: resultText,
      usage: { tokens: response.usage?.input_tokens || 0 },
    };
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/model/adapters/
git commit -m "feat: claude vision and text adapters"
```

---

### Task 6: Task Service

**Files:**
- Create: `src/core/task-service.ts`
- Test: `tests/core/task-service.test.ts`

- [ ] **Step 1: Write task service**

```typescript
import { eq, desc, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { tasks, type Task, type NewTask } from "../db/schema.js";
import { InputType } from "../types/index.js";

export interface CreateTaskParams {
  userId?: string;
  sessionId?: string;
  inputType: InputType;
  inputData: Record<string, unknown>;
  model: string;
  prompt?: string;
  syncRequest?: boolean;
}

export async function createTask(params: CreateTaskParams): Promise<Task> {
  const newTask: NewTask = {
    userId: params.userId,
    sessionId: params.sessionId,
    inputType: params.inputType,
    inputData: params.inputData,
    model: params.model,
    prompt: params.prompt,
    syncRequest: params.syncRequest ?? false,
  };

  const [task] = await db.insert(tasks).values(newTask).returning();
  return task;
}

export async function getTaskById(id: string): Promise<Task | undefined> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return task;
}

export async function updateTaskStatus(
  id: string,
  status: Task["status"],
  updates?: Partial<Pick<Task, "result" | "error" | "retryCount" | "nextRetryAt">>
): Promise<void> {
  await db
    .update(tasks)
    .set({
      status,
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id));
}

export async function listTasks(params: {
  userId?: string;
  sessionId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: Task[]; total: number }> {
  const page = params.page || 1;
  const pageSize = Math.min(params.pageSize || 20, 100);

  const conditions = [];
  if (params.userId) conditions.push(eq(tasks.userId, params.userId));
  if (params.sessionId) conditions.push(eq(tasks.sessionId, params.sessionId));
  if (params.status) conditions.push(eq(tasks.status, params.status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db
    .select()
    .from(tasks)
    .where(where)
    .orderBy(desc(tasks.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(where);

  return { items, total: countResult[0]?.count || 0 };
}

import { sql } from "drizzle-orm";
```

- [ ] **Step 2: Commit**

```bash
git add src/core/task-service.ts
git commit -m "feat: task service CRUD operations"
```

---

### Task 7: Type Resolver

**Files:**
- Create: `src/core/type-resolver.ts`
- Test: `tests/core/type-resolver.test.ts`

- [ ] **Step 1: Write type resolver**

```typescript
import { InputType } from "../types/index.js";
import axios from "axios";

const IMAGE_MAGIC = [
  { bytes: [0xff, 0xd8], type: "image" as InputType }, // JPEG
  { bytes: [0x89, 0x50], type: "image" as InputType }, // PNG
  { bytes: [0x47, 0x49], type: "image" as InputType }, // GIF
  { bytes: [0x52, 0x49], type: "image" as InputType }, // WebP
];

const VIDEO_MAGIC = [
  { bytes: [0x66, 0x74], type: "video" as InputType }, // MP4
  { bytes: [0x00, 0x00], type: "video" as InputType }, // MP4 variant
];

const AUDIO_MAGIC = [
  { bytes: [0x49, 0x44], type: "audio" as InputType }, // MP3 (ID3)
  { bytes: [0x66, 0x4c], type: "audio" as InputType }, // FLAC
  { bytes: [0x52, 0x49], type: "audio" as InputType }, // WAV
];

const URL_TYPE_MAP: Record<string, InputType> = {
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image",
  ".gif": "image",
  ".webp": "image",
  ".mp4": "video",
  ".mov": "video",
  ".avi": "video",
  ".mp3": "audio",
  ".wav": "audio",
  ".flac": "audio",
  ".m4a": "audio",
};

export async function resolveInputType(
  input: { url?: string; file?: { buffer: Buffer; mimetype?: string } },
  explicitType?: string
): Promise<InputType> {
  if (explicitType) {
    if (["image", "video", "audio", "link"].includes(explicitType)) {
      return explicitType as InputType;
    }
    throw new Error(`Unsupported input_type: ${explicitType}`);
  }

  if (input.url) {
    return await resolveUrlType(input.url);
  }

  if (input.file) {
    return resolveFileType(input.file.buffer, input.file.mimetype);
  }

  throw new Error("No input provided");
}

async function resolveUrlType(url: string): Promise<InputType> {
  try {
    const response = await axios.head(url, {
      timeout: 10000,
      maxRedirects: 5,
    });
    const contentType = response.headers["content-type"] || "";

    if (contentType.startsWith("image/")) return "image";
    if (contentType.startsWith("video/")) return "video";
    if (contentType.startsWith("audio/")) return "audio";
    if (contentType.includes("text/html")) return "link";
  } catch {
    // HEAD failed, fallback to extension
  }

  const lowerUrl = url.toLowerCase();
  for (const [ext, type] of Object.entries(URL_TYPE_MAP)) {
    if (lowerUrl.endsWith(ext)) return type;
  }

  // Default to link if URL doesn't match known extensions
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return "link";
  }

  throw new Error(`Cannot resolve type for URL: ${url}`);
}

function resolveFileType(buffer: Buffer, mimetype?: string): InputType {
  if (mimetype) {
    if (mimetype.startsWith("image/")) return "image";
    if (mimetype.startsWith("video/")) return "video";
    if (mimetype.startsWith("audio/")) return "audio";
  }

  const header = Array.from(buffer.slice(0, 16));

  for (const magic of IMAGE_MAGIC) {
    if (header[0] === magic.bytes[0] && header[1] === magic.bytes[1]) {
      return magic.type;
    }
  }

  for (const magic of VIDEO_MAGIC) {
    if (header[0] === magic.bytes[0] && header[1] === magic.bytes[1]) {
      return magic.type;
    }
  }

  for (const magic of AUDIO_MAGIC) {
    if (header[0] === magic.bytes[0] && header[1] === magic.bytes[1]) {
      return magic.type;
    }
  }

  throw new Error("Cannot resolve file type from magic bytes");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/type-resolver.ts
git commit -m "feat: input type resolver"
```

---

### Task 8: API Server Foundation

**Files:**
- Create: `src/api/server.ts`
- Create: `src/api/middleware/error-handler.ts`
- Create: `src/api/middleware/auth.ts`

- [ ] **Step 1: Write error handler**

```typescript
import { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export function errorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply
) {
  const statusCode = error.statusCode || 500;
  reply.status(statusCode).send({
    code: statusCode,
    data: null,
    message: error.message || "Internal server error",
  });
}
```

- [ ] **Step 2: Write auth middleware**

```typescript
import { FastifyRequest, FastifyReply } from "fastify";
import { config } from "../../config/index.js";

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    reply.status(401).send({
      code: 401,
      data: null,
      message: "Missing or invalid API key",
    });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== config.apiKey) {
    reply.status(401).send({
      code: 401,
      data: null,
      message: "Invalid API key",
    });
    return;
  }
}
```

- [ ] **Step 3: Write server**

```typescript
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { config } from "../config/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authMiddleware } from "./middleware/auth.js";

export async function buildServer() {
  const app = Fastify({
    logger: true,
    bodyLimit: config.maxFileSize,
  });

  app.setErrorHandler(errorHandler);
  await app.register(multipart, {
    limits: {
      fileSize: config.maxFileSize,
    },
  });

  app.addHook("onRequest", authMiddleware);

  return app;
}

export async function startServer() {
  const app = await buildServer();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`Server listening on port ${config.port}`);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/api/
git commit -m "feat: api server foundation with auth and error handling"
```

---

### Task 9: Task Routes

**Files:**
- Create: `src/api/routes/tasks.ts`

- [ ] **Step 1: Write task routes**

```typescript
import { FastifyInstance } from "fastify";
import { createTask, getTaskById, listTasks } from "../../core/task-service.js";
import { resolveInputType } from "../../core/type-resolver.js";
import { config } from "../../config/index.js";

export async function taskRoutes(app: FastifyInstance) {
  // POST /api/v1/tasks
  app.post("/api/v1/tasks", async (request, reply) => {
    const data = await request.file();
    const body = data ? Object.fromEntries(Object.entries(data.fields || {})) : (request.body as Record<string, unknown>);

    const inputUrl = body.input_url as string | undefined;
    const inputType = body.input_type as string | undefined;
    const model = body.model as string;
    const prompt = body.prompt as string | undefined;
    const userId = body.user_id as string | undefined;
    const sessionId = body.session_id as string | undefined;
    const sync = (body.sync as string) === "true";
    const timeout = Math.min(
      parseInt((body.timeout as string) || String(config.syncTimeoutDefault)),
      config.syncTimeoutMax
    );

    if (!model) {
      reply.status(400).send({ code: 400, data: null, message: "model is required" });
      return;
    }

    let fileBuffer: Buffer | undefined;
    let fileMimetype: string | undefined;

    if (data) {
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      fileBuffer = Buffer.concat(chunks);
      fileMimetype = data.mimetype;
    }

    if (!inputUrl && !fileBuffer) {
      reply.status(400).send({ code: 400, data: null, message: "file or input_url is required" });
      return;
    }

    const resolvedType = await resolveInputType(
      { url: inputUrl, file: fileBuffer ? { buffer: fileBuffer, mimetype: fileMimetype } : undefined },
      inputType
    );

    const inputData = inputUrl
      ? { url: inputUrl }
      : { filePath: "uploaded", mimeType: fileMimetype, size: fileBuffer?.length };

    const task = await createTask({
      userId,
      sessionId,
      inputType: resolvedType,
      inputData,
      model,
      prompt,
      syncRequest: sync,
    });

    if (sync) {
      // TODO: Implement sync waiting (Task 14)
      reply.status(200).send({
        code: 200,
        data: { ...task, message: "Sync mode not yet implemented, use task_id to query" },
        message: "success",
      });
      return;
    }

    reply.status(200).send({
      code: 200,
      data: {
        task_id: task.id,
        user_id: task.userId,
        session_id: task.sessionId,
        status: task.status,
        created_at: task.createdAt,
      },
      message: "success",
    });
  });

  // GET /api/v1/tasks/:task_id
  app.get("/api/v1/tasks/:task_id", async (request, reply) => {
    const { task_id } = request.params as { task_id: string };
    const task = await getTaskById(task_id);

    if (!task) {
      reply.status(404).send({ code: 404, data: null, message: "Task not found" });
      return;
    }

    reply.status(200).send({
      code: 200,
      data: {
        task_id: task.id,
        user_id: task.userId,
        session_id: task.sessionId,
        status: task.status,
        input_type: task.inputType,
        model: task.model,
        result: task.result,
        error: task.error,
        created_at: task.createdAt,
        completed_at: task.status === "completed" ? task.updatedAt : undefined,
      },
      message: "success",
    });
  });

  // GET /api/v1/tasks
  app.get("/api/v1/tasks", async (request, reply) => {
    const query = request.query as Record<string, string>;
    const result = await listTasks({
      userId: query.user_id,
      sessionId: query.session_id,
      status: query.status,
      page: query.page ? parseInt(query.page) : undefined,
      pageSize: query.page_size ? parseInt(query.page_size) : undefined,
    });

    reply.status(200).send({
      code: 200,
      data: {
        items: result.items.map((task) => ({
          task_id: task.id,
          user_id: task.userId,
          session_id: task.sessionId,
          status: task.status,
          input_type: task.inputType,
          model: task.model,
          created_at: task.createdAt,
        })),
        total: result.total,
        page: parseInt(query.page || "1"),
        page_size: parseInt(query.page_size || "20"),
      },
      message: "success",
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/routes/tasks.ts
git commit -m "feat: task creation and query routes"
```

---

### Task 10: Models Route

**Files:**
- Create: `src/api/routes/models.ts`

- [ ] **Step 1: Write models route**

```typescript
import { FastifyInstance } from "fastify";
import { getAvailableModels } from "../../model/model-registry.js";

export async function modelRoutes(app: FastifyInstance) {
  app.get("/api/v1/models", async (_request, reply) => {
    const models = getAvailableModels();
    reply.status(200).send({
      code: 200,
      data: { models },
      message: "success",
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/routes/models.ts
git commit -m "feat: models list route"
```

---

### Task 11: SSE Manager and Route

**Files:**
- Create: `src/core/sse-manager.ts`
- Create: `src/api/routes/sse.ts`

- [ ] **Step 1: Write SSE manager**

```typescript
import { FastifyReply } from "fastify";

interface SSEConnection {
  taskId: string;
  reply: FastifyReply;
}

const connections = new Map<string, SSEConnection>();

export function registerSSE(taskId: string, reply: FastifyReply): void {
  connections.set(taskId, { taskId, reply });

  reply.raw.on("close", () => {
    connections.delete(taskId);
  });
}

export function pushSSE(taskId: string, event: string, data: unknown): void {
  const conn = connections.get(taskId);
  if (!conn) return;

  conn.reply.raw.write(`event: ${event}\n`);
  conn.reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);

  if (event === "completed" || event === "failed") {
    conn.reply.raw.end();
    connections.delete(taskId);
  }
}
```

- [ ] **Step 2: Write SSE route**

```typescript
import { FastifyInstance } from "fastify";
import { getTaskById } from "../../core/task-service.js";
import { registerSSE } from "../../core/sse-manager.js";

export async function sseRoutes(app: FastifyInstance) {
  app.get("/api/v1/tasks/:task_id/stream", async (request, reply) => {
    const { task_id } = request.params as { task_id: string };
    const task = await getTaskById(task_id);

    if (!task) {
      reply.status(404).send({ code: 404, data: null, message: "Task not found" });
      return;
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    registerSSE(task_id, reply);

    // If already completed/failed, push immediately
    if (task.status === "completed" || task.status === "failed") {
      const event = task.status === "completed" ? "completed" : "failed";
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify({
        task_id: task.id,
        status: task.status,
        result: task.result,
        error: task.error,
      })}\n\n`);
      reply.raw.end();
    }
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/core/sse-manager.ts src/api/routes/sse.ts
git commit -m "feat: SSE real-time push"
```

---

### Task 12: Worker Queue Operations

**Files:**
- Create: `src/db/queue.ts`

- [ ] **Step 1: Write queue operations**

```typescript
import { eq, sql, and, lte, isNull } from "drizzle-orm";
import { db } from "./client.js";
import { tasks, type Task } from "./schema.js";

export async function claimTask(): Promise<Task | undefined> {
  const result = await db.execute<Task[]>(sql`
    WITH claimed AS (
      SELECT id
      FROM ${tasks}
      WHERE status = 'pending'
        AND (${isNull(tasks.nextRetryAt)} OR ${lte(tasks.nextRetryAt, sql`NOW()`)})
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE ${tasks}
    SET status = 'processing', updated_at = NOW()
    FROM claimed
    WHERE ${tasks.id} = claimed.id
    RETURNING ${tasks}.*
  `);

  return result.rows[0];
}

export async function completeTask(
  taskId: string,
  result: Record<string, unknown>
): Promise<void> {
  await db
    .update(tasks)
    .set({
      status: "completed",
      result,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));
}

export async function failTask(taskId: string, error: string): Promise<void> {
  const [task] = await db
    .select({ retryCount: tasks.retryCount, maxRetries: tasks.maxRetries })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (task && task.retryCount < task.maxRetries) {
    const retryCount = task.retryCount + 1;
    const nextRetryAt = new Date(Date.now() + Math.pow(2, retryCount) * 1000);

    await db
      .update(tasks)
      .set({
        status: "pending",
        retryCount,
        nextRetryAt,
        error,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
  } else {
    await db
      .update(tasks)
      .set({
        status: "failed",
        error,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
  }
}

export async function resetStaleTasks(timeoutMinutes: number = 5): Promise<void> {
  await db.execute(sql`
    UPDATE ${tasks}
    SET status = 'pending', updated_at = NOW()
    WHERE status = 'processing'
      AND updated_at < NOW() - INTERVAL '${sql.raw(String(timeoutMinutes))} minutes'
  `);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/db/queue.ts
git commit -m "feat: worker queue operations with retry logic"
```

---

### Task 13: Link Handler with Playwright

**Files:**
- Create: `src/worker/media/link-fetcher.ts`
- Create: `src/worker/handlers/link-handler.ts`

- [ ] **Step 1: Write link fetcher**

```typescript
import axios from "axios";
import { chromium } from "playwright";
import * as cheerio from "cheerio";

const SOCIAL_DOMAINS = new Set([
  "douyin.com",
  "iesdouyin.com",
  "v.douyin.com",
  "xiaohongshu.com",
  "xhs.link",
  "weibo.com",
  "weibo.cn",
  "bilibili.com",
  "b23.tv",
  "youtube.com",
  "youtu.be",
]);

function isSocialMedia(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return Array.from(SOCIAL_DOMAINS).some((d) => hostname.includes(d));
  } catch {
    return false;
  }
}

function isPrivateIP(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return (
      hostname === "localhost" ||
      hostname.startsWith("127.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.")
    );
  } catch {
    return true;
  }
}

export async function fetchLinkContent(url: string): Promise<{ text: string; truncated: boolean }> {
  if (isPrivateIP(url)) {
    throw new Error("Private IP addresses are not allowed");
  }

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("Only HTTP/HTTPS URLs are supported");
  }

  const usePlaywright = isSocialMedia(url);

  if (usePlaywright) {
    return fetchWithPlaywright(url);
  }

  return fetchWithAxios(url);
}

async function fetchWithAxios(url: string): Promise<{ text: string; truncated: boolean }> {
  const response = await axios.get(url, {
    timeout: 30000,
    maxRedirects: 5,
    maxContentLength: 5 * 1024 * 1024,
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });

  const contentType = response.headers["content-type"] || "";

  if (contentType.includes("text/html")) {
    return extractFromHtml(response.data);
  }

  return { text: String(response.data), truncated: false };
}

async function fetchWithPlaywright(url: string): Promise<{ text: string; truncated: boolean }> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    });

    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(3000);

    const text = await page.evaluate(() => {
      document.querySelectorAll("script, style, nav, header, footer, aside").forEach((el) => el.remove());
      return document.body?.innerText || "";
    });

    return { text: text.trim(), truncated: false };
  } finally {
    await browser.close();
  }
}

function extractFromHtml(html: string): { text: string; truncated: boolean } {
  const $ = cheerio.load(html);

  // Remove noise
  $("script, style, nav, header, footer, aside, [class*='ad'], [class*='sidebar']").remove();

  // Try semantic selectors
  let text = $("article").text() || $("main").text() || $("[role='main']").text();

  // Fallback to body
  if (!text.trim()) {
    text = $("body").text();
  }

  // Clean up whitespace
  text = text.replace(/\s+/g, " ").trim();

  const MAX_LENGTH = 50000;
  const truncated = text.length > MAX_LENGTH;

  return {
    text: text.slice(0, MAX_LENGTH),
    truncated,
  };
}
```

- [ ] **Step 2: Write link handler**

```typescript
import { fetchLinkContent } from "../media/link-fetcher.js";
import { getAdapter } from "../../model/model-registry.js";
import { ProcessResult } from "../../types/index.js";
import { Task } from "../../db/schema.js";

export async function handleLink(task: Task): Promise<ProcessResult> {
  const inputData = task.inputData as { url: string };
  const adapter = getAdapter(task.model);

  if (!adapter) {
    throw new Error(`Model adapter not found: ${task.model}`);
  }

  const { text, truncated } = await fetchLinkContent(inputData.url);

  const result = await adapter.process({
    type: "link",
    content: text,
    prompt: task.prompt || undefined,
  });

  if (truncated) {
    result.structured = { ...(result.structured || {}), content_truncated: true };
  }

  return result;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/worker/media/link-fetcher.ts src/worker/handlers/link-handler.ts
git commit -m "feat: link handler with playwright support"
```

---

### Task 14: Image and Video Handlers

**Files:**
- Create: `src/worker/media/image-processor.ts`
- Create: `src/worker/handlers/image-handler.ts`
- Create: `src/worker/media/video-processor.ts`
- Create: `src/worker/handlers/video-handler.ts`

- [ ] **Step 1: Write image processor**

```typescript
import sharp from "sharp";

const MAX_DIMENSION = 2048;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB for base64

export async function processImage(input: Buffer | string): Promise<string> {
  let buffer: Buffer;

  if (typeof input === "string") {
    const response = await fetch(input);
    buffer = Buffer.from(await response.arrayBuffer());
  } else {
    buffer = input;
  }

  let image = sharp(buffer);
  const metadata = await image.metadata();

  // Resize if too large
  if ((metadata.width && metadata.width > MAX_DIMENSION) ||
      (metadata.height && metadata.height > MAX_DIMENSION)) {
    image = image.resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true });
  }

  // Convert to JPEG for consistency
  let output = await image.jpeg({ quality: 85 }).toBuffer();

  // If still too large, reduce quality
  if (output.length > MAX_FILE_SIZE) {
    output = await sharp(output).jpeg({ quality: 70 }).toBuffer();
  }

  return output.toString("base64");
}
```

- [ ] **Step 2: Write image handler**

```typescript
import { processImage } from "../media/image-processor.js";
import { getAdapter } from "../../model/model-registry.js";
import { ProcessResult } from "../../types/index.js";
import { Task } from "../../db/schema.js";
import axios from "axios";

export async function handleImage(task: Task): Promise<ProcessResult> {
  const inputData = task.inputData as { url?: string; filePath?: string; mimeType?: string };
  const adapter = getAdapter(task.model);

  if (!adapter) {
    throw new Error(`Model adapter not found: ${task.model}`);
  }

  let base64Image: string;

  if (inputData.url) {
    const response = await axios.get(inputData.url, { responseType: "arraybuffer", timeout: 30000 });
    base64Image = await processImage(Buffer.from(response.data));
  } else {
    // For uploaded files, read from temp storage
    // TODO: Implement file storage
    throw new Error("File upload processing not yet implemented");
  }

  return adapter.process({
    type: "image",
    content: base64Image,
    prompt: task.prompt || undefined,
  });
}
```

- [ ] **Step 3: Write video processor**

```typescript
import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export async function extractVideoFrames(
  videoPath: string,
  options: { maxFrames?: number } = {}
): Promise<string[]> {
  const maxFrames = options.maxFrames || 5;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "video-"));

  try {
    // Get video duration
    const duration = await getVideoDuration(videoPath);

    // Extract frames at evenly spaced intervals
    const frameTimestamps = Array.from({ length: maxFrames }, (_, i) =>
      Math.floor((duration / (maxFrames + 1)) * (i + 1))
    );

    const framePaths: string[] = [];

    for (let i = 0; i < frameTimestamps.length; i++) {
      const outputPath = path.join(tempDir, `frame-${i}.jpg`);
      await extractFrame(videoPath, outputPath, frameTimestamps[i]);
      framePaths.push(outputPath);
    }

    // Convert to base64
    const base64Frames = await Promise.all(
      framePaths.map(async (fp) => {
        const buffer = await fs.readFile(fp);
        return buffer.toString("base64");
      })
    );

    return base64Frames;
  } finally {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
}

function extractFrame(videoPath: string, outputPath: string, timestamp: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: [timestamp],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: "1280x720",
      })
      .on("end", resolve)
      .on("error", reject);
  });
}
```

- [ ] **Step 4: Write video handler**

```typescript
import { extractVideoFrames } from "../media/video-processor.js";
import { getAdapter } from "../../model/model-registry.js";
import { ProcessResult } from "../../types/index.js";
import { Task } from "../../db/schema.js";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import os from "os";

export async function handleVideo(task: Task): Promise<ProcessResult> {
  const inputData = task.inputData as { url?: string; filePath?: string };
  const adapter = getAdapter(task.model);

  if (!adapter) {
    throw new Error(`Model adapter not found: ${task.model}`);
  }

  let videoPath: string;

  if (inputData.url) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "video-dl-"));
    videoPath = path.join(tempDir, "video.mp4");
    const response = await axios.get(inputData.url, {
      responseType: "arraybuffer",
      timeout: 60000,
    });
    await fs.writeFile(videoPath, Buffer.from(response.data));
  } else {
    throw new Error("File upload processing not yet implemented");
  }

  try {
    const frames = await extractVideoFrames(videoPath);

    return adapter.process({
      type: "video",
      content: frames,
      prompt: task.prompt || "Describe what happens in this video based on these frames.",
    });
  } finally {
    await fs.rm(path.dirname(videoPath), { recursive: true, force: true }).catch(() => {});
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/worker/media/ src/worker/handlers/image-handler.ts src/worker/handlers/video-handler.ts
git commit -m "feat: image and video handlers with frame extraction"
```

---

### Task 15: Task Dispatcher and Worker Main

**Files:**
- Create: `src/worker/task-dispatcher.ts`
- Create: `src/worker/worker.ts`
- Create: `scripts/start-worker.ts`

- [ ] **Step 1: Write task dispatcher**

```typescript
import { Task } from "../db/schema.js";
import { handleLink } from "./handlers/link-handler.js";
import { handleImage } from "./handlers/image-handler.js";
import { handleVideo } from "./handlers/video-handler.js";
import { ProcessResult } from "../types/index.js";

export async function dispatchTask(task: Task): Promise<ProcessResult> {
  switch (task.inputType) {
    case "link":
      return handleLink(task);
    case "image":
      return handleImage(task);
    case "video":
      return handleVideo(task);
    case "audio":
      throw new Error("Audio handling not yet implemented");
    default:
      throw new Error(`Unknown input type: ${task.inputType}`);
  }
}
```

- [ ] **Step 2: Write worker main loop**

```typescript
import { claimTask, completeTask, failTask, resetStaleTasks } from "../db/queue.js";
import { dispatchTask } from "./task-dispatcher.js";
import { config } from "../config/index.js";
import { pushSSE } from "../core/sse-manager.js";

let running = true;

export async function startWorker(): Promise<void> {
  console.log("Worker started");

  // Reset stale tasks on startup
  await resetStaleTasks(5);

  while (running) {
    try {
      const task = await claimTask();

      if (!task) {
        await sleep(config.workerPollIntervalMs);
        continue;
      }

      console.log(`Processing task: ${task.id}, type: ${task.inputType}`);

      try {
        const result = await dispatchTask(task);
        await completeTask(task.id, result);
        pushSSE(task.id, "completed", {
          task_id: task.id,
          status: "completed",
          result,
        });
        console.log(`Task completed: ${task.id}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Task failed: ${task.id}, error: ${errorMessage}`);
        await failTask(task.id, errorMessage);
        pushSSE(task.id, "failed", {
          task_id: task.id,
          status: "failed",
          error: errorMessage,
        });
      }
    } catch (error) {
      console.error("Worker loop error:", error);
      await sleep(config.workerPollIntervalMs);
    }
  }
}

export function stopWorker(): void {
  running = false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 3: Write worker startup script**

```typescript
import { startWorker } from "../src/worker/worker.js";

process.on("SIGINT", () => {
  console.log("Shutting down worker...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Shutting down worker...");
  process.exit(0);
});

startWorker().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
```

- [ ] **Step 4: Commit**

```bash
git add src/worker/task-dispatcher.ts src/worker/worker.ts scripts/start-worker.ts
git commit -m "feat: worker dispatcher and main loop"
```

---

### Task 16: Wire Up API Server with All Routes

**Files:**
- Modify: `src/api/server.ts`

- [ ] **Step 1: Update server to register all routes**

```typescript
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { config } from "../config/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authMiddleware } from "./middleware/auth.js";
import { taskRoutes } from "./routes/tasks.js";
import { modelRoutes } from "./routes/models.js";
import { sseRoutes } from "./routes/sse.js";

export async function buildServer() {
  const app = Fastify({
    logger: true,
    bodyLimit: config.maxFileSize,
  });

  app.setErrorHandler(errorHandler);
  await app.register(multipart, {
    limits: {
      fileSize: config.maxFileSize,
    },
  });

  app.addHook("onRequest", authMiddleware);

  // Register routes
  await app.register(taskRoutes);
  await app.register(modelRoutes);
  await app.register(sseRoutes);

  return app;
}

export async function startServer() {
  const app = await buildServer();
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`Server listening on port ${config.port}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/server.ts
git commit -m "feat: wire up all routes in server"
```

---

### Task 17: Docker Compose Setup

**Files:**
- Create: `docker-compose.yml`
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Write Dockerfile**

```dockerfile
FROM node:22-alpine

# Install ffmpeg and Playwright dependencies
RUN apk add --no-cache ffmpeg chromium nss freetype harfbuzz ca-certificates ttf-freefont

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

- [ ] **Step 2: Write docker-compose.yml**

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: media_processor
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/media_processor
      - API_KEY=${API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    depends_on:
      - postgres
    command: sh -c "npm run db:migrate && npm start"

  worker:
    build: .
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/media_processor
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    depends_on:
      - postgres
    command: sh -c "npm run db:migrate && npm run start:worker"
    deploy:
      replicas: 2

volumes:
  postgres_data:
```

- [ ] **Step 3: Write .dockerignore**

```
node_modules
dist
.env
.DS_Store
*.log
.vscode
.idea
git
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml Dockerfile .dockerignore
git commit -m "feat: docker compose setup"
```

---

### Task 18: Sync Waiter (for synchronous requests)

**Files:**
- Create: `src/core/sync-waiter.ts`

- [ ] **Step 1: Write sync waiter**

```typescript
import { getTaskById } from "./task-service.js";
import { Task } from "../db/schema.js";

const waiters = new Map<string, { resolve: (task: Task) => void; reject: (err: Error) => void }>();

export function registerWaiter(taskId: string): Promise<Task> {
  return new Promise((resolve, reject) => {
    waiters.set(taskId, { resolve, reject });

    // Timeout cleanup
    setTimeout(() => {
      if (waiters.has(taskId)) {
        waiters.delete(taskId);
        reject(new Error("Sync wait timeout"));
      }
    }, 120000);
  });
}

export function resolveWaiter(taskId: string): void {
  const waiter = waiters.get(taskId);
  if (!waiter) return;

  getTaskById(taskId).then((task) => {
    if (task) waiter.resolve(task);
    waiters.delete(taskId);
  });
}

export function rejectWaiter(taskId: string, error: Error): void {
  const waiter = waiters.get(taskId);
  if (!waiter) return;

  waiter.reject(error);
  waiters.delete(taskId);
}
```

- [ ] **Step 2: Update task route for sync mode**

Modify `src/api/routes/tasks.ts` to use sync waiter:

```typescript
import { registerWaiter } from "../../core/sync-waiter.js";

// In the POST handler, replace the sync block with:
if (sync) {
  try {
    const completedTask = await Promise.race([
      registerWaiter(task.id),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeout * 1000)
      ),
    ]);

    reply.status(200).send({
      code: 200,
      data: {
        task_id: completedTask.id,
        user_id: completedTask.userId,
        session_id: completedTask.sessionId,
        status: completedTask.status,
        input_type: completedTask.inputType,
        model: completedTask.model,
        result: completedTask.result,
        created_at: completedTask.createdAt,
        completed_at: completedTask.updatedAt,
      },
      message: "success",
    });
  } catch {
    reply.status(200).send({
      code: 200,
      data: {
        task_id: task.id,
        user_id: task.userId,
        session_id: task.sessionId,
        status: "processing",
        message: "Task is still processing, use task_id to query later",
        created_at: task.createdAt,
      },
      message: "success",
    });
  }
  return;
}
```

- [ ] **Step 3: Update worker to resolve sync waiters**

Modify `src/worker/worker.ts` to call resolveWaiter after completing a task.

- [ ] **Step 4: Commit**

```bash
git add src/core/sync-waiter.ts src/api/routes/tasks.ts src/worker/worker.ts
git commit -m "feat: sync request waiter with timeout"
```

---

### Task 19: PostgreSQL LISTEN/NOTIFY for Real-time Updates

**Files:**
- Create: `src/db/notify.ts`
- Modify: `src/worker/worker.ts`
- Modify: `src/api/server.ts`

- [ ] **Step 1: Write notify helper**

```typescript
import { db } from "./client.js";

export async function notifyTaskChange(taskId: string, status: string): Promise<void> {
  await db.execute(
    `NOTIFY task_status_change, '${JSON.stringify({ task_id: taskId, status })}'`
  );
}

export async function listenTaskChanges(callback: (payload: { task_id: string; status: string }) => void): Promise<void> {
  const pool = (db as any).$client as import("pg").Pool;
  const client = await pool.connect();

  await client.query("LISTEN task_status_change");

  client.on("notification", (msg) => {
    if (msg.payload) {
      try {
        const data = JSON.parse(msg.payload);
        callback(data);
      } catch {
        // ignore invalid payload
      }
    }
  });
}
```

- [ ] **Step 2: Update worker to notify on completion**

After `completeTask` and `failTask`, call `notifyTaskChange`.

- [ ] **Step 3: Update server to listen for changes**

In `src/api/server.ts`, after starting the server, start listening for task changes and trigger SSE push + sync waiter resolution.

- [ ] **Step 4: Commit**

```bash
git add src/db/notify.ts src/worker/worker.ts src/api/server.ts
git commit -m "feat: postgres LISTEN/NOTIFY for real-time updates"
```

---

### Task 20: Final Integration Test

**Files:**
- Create: `tests/integration/api.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../src/api/server.js";
import { db } from "../src/db/client.js";
import { tasks } from "../src/db/schema.js";

describe("API Integration", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    app = await buildServer();
    // Clean up test data
    await db.delete(tasks);
  });

  afterAll(async () => {
    await app.close();
  });

  it("should create a task with URL", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      headers: {
        authorization: "Bearer test-key",
        "content-type": "application/json",
      },
      payload: {
        input_url: "https://example.com/article",
        model: "claude-text",
        user_id: "user_123",
        session_id: "session_abc",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.code).toBe(200);
    expect(body.data.task_id).toBeDefined();
    expect(body.data.status).toBe("pending");
  });

  it("should return 401 without API key", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      payload: {
        input_url: "https://example.com",
        model: "claude-text",
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it("should get models list", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/models",
      headers: { authorization: "Bearer test-key" },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.data.models).toBeDefined();
    expect(Array.isArray(body.data.models)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: Tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/
git commit -m "test: integration tests for api endpoints"
```

---

## Spec Coverage Check

| Spec Section | Implementing Task |
|-------------|-------------------|
| Database schema (tasks table) | Task 2 |
| TypeResolver auto-detection | Task 7 |
| RESTful API (create/query/list tasks) | Task 9 |
| Models list API | Task 10 |
| SSE real-time push | Task 11 |
| Worker queue (FOR UPDATE SKIP LOCKED) | Task 12 |
| Link handling with Playwright | Task 13 |
| Image/video processing | Task 14 |
| Worker dispatcher & main loop | Task 15 |
| Sync request waiting | Task 18 |
| PostgreSQL NOTIFY | Task 19 |
| Docker deployment | Task 17 |
| Authentication | Task 8 |
| Retry mechanism | Task 12 |
| User/session fields | Task 2, 9 |

**Gaps:**
- Audio handler (Task 14 placeholder, needs Whisper integration)
- File upload storage (currently throws "not yet implemented")
- Rate limiting middleware (defined in structure but not implemented)
- GPT/Gemini adapters (only Claude implemented)

---

## Execution Choice

Plan complete and saved to `docs/superpowers/plans/2026-04-18-ai-media-processor.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach do you prefer?
