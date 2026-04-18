import { FastifyInstance } from "fastify";
import { createTask, getTaskById, listTasks } from "../../core/task-service.js";
import { registerWaiter } from "../../core/sync-waiter.js";
import { resolveInputType } from "../../core/type-resolver.js";
import { config } from "../../config/index.js";

export async function taskRoutes(app: FastifyInstance) {
  app.post("/api/v1/tasks", async (request, reply) => {
    const contentType = request.headers["content-type"] || "";
    const isMultipart = contentType.startsWith("multipart/form-data");
    const data = isMultipart ? await request.file() : undefined;
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
