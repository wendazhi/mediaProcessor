import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { config } from "../config/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authMiddleware } from "./middleware/auth.js";
import { taskRoutes } from "./routes/tasks.js";
import { modelRoutes } from "./routes/models.js";
import { sseRoutes } from "./routes/sse.js";
import { listenTaskChanges } from "../db/notify.js";
import { pushSSE } from "../core/sse-manager.js";
import { resolveWaiter } from "../core/sync-waiter.js";
import { initModelAdapters } from "../model/init.js";

export async function buildServer() {
  // Initialize model adapters
  initModelAdapters();

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

  await listenTaskChanges((payload) => {
    pushSSE(payload.task_id, payload.status, payload);
    resolveWaiter(payload.task_id);
  });
}
