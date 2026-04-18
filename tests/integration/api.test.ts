import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../../src/api/server.js";
import { db } from "../../src/db/client.js";
import { tasks } from "../../src/db/schema.js";

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
