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
