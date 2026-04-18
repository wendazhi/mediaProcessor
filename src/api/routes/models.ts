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
