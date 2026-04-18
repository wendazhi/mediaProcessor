import { buildServer } from "../src/api/server.js";
import { startWorker } from "../src/worker/worker.js";
import { db } from "../src/db/client.js";
import { tasks } from "../src/db/schema.js";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function e2eTest() {
  console.log("=== E2E Test: Create Task → Worker Process → Get Result ===\n");

  // Clean up
  await db.delete(tasks);
  console.log("✅ Cleaned up test data");

  // Build server
  const app = await buildServer();
  console.log("✅ Server built");

  // Test 1: Create a link task (async)
  console.log("\n--- Test 1: Async Link Task ---");
  const createRes = await app.inject({
    method: "POST",
    url: "/api/v1/tasks",
    headers: {
      authorization: "Bearer test-key",
      "content-type": "application/json",
    },
    payload: {
      input_url: "https://www.volcengine.com/docs/82379/1362931",
      model: "volcano-text",
      user_id: "test_user",
      session_id: "test_session",
      prompt: "请总结这个页面的主要内容",
    },
  });

  const createBody = JSON.parse(createRes.payload);
  console.log("Create response:", JSON.stringify(createBody, null, 2));

  if (createBody.code !== 200) {
    console.error("❌ Failed to create task");
    process.exit(1);
  }

  const taskId = createBody.data.task_id;
  console.log(`✅ Task created: ${taskId}`);

  // Start worker to process the task
  console.log("\n--- Starting Worker ---");

  // Run worker for a limited time
  const workerPromise = startWorker();

  // Poll for result
  console.log("\n--- Polling for result ---");
  let completed = false;
  let retries = 0;
  const maxRetries = 30;

  while (!completed && retries < maxRetries) {
    await sleep(2000);

    const queryRes = await app.inject({
      method: "GET",
      url: `/api/v1/tasks/${taskId}`,
      headers: { authorization: "Bearer test-key" },
    });

    const queryBody = JSON.parse(queryRes.payload);
    const status = queryBody.data?.status;

    console.log(`Poll ${retries + 1}: status = ${status}`);

    if (status === "completed") {
      console.log("\n✅ Task completed!");
      console.log("\n📝 Result:");
      console.log(queryBody.data.result?.text || "(no text)");
      completed = true;
    } else if (status === "failed") {
      console.log("\n❌ Task failed!");
      console.log("Error:", queryBody.data.error);
      completed = true;
    }

    retries++;
  }

  if (!completed) {
    console.log("\n⚠️ Timeout waiting for task completion");
  }

  // Stop worker
  process.exit(0);
}

e2eTest().catch((err) => {
  console.error("E2E test failed:", err);
  process.exit(1);
});
