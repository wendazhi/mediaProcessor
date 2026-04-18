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
