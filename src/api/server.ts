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
