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
