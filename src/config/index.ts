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
