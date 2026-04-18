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
