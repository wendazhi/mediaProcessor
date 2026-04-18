import { buildServer } from "../src/api/server.js";
import { claimTask, completeTask } from "../src/db/queue.js";
import { dispatchTask } from "../src/worker/task-dispatcher.js";
import { notifyTaskChange, listenTaskChanges } from "../src/db/notify.js";
import { pushSSE } from "../src/core/sse-manager.js";
import { resolveWaiter } from "../src/core/sync-waiter.js";
import { db } from "../src/db/client.js";
import { tasks } from "../src/db/schema.js";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testSync() {
  console.log("=== Sync Mode E2E Test ===\n");

  // Clean up
  await db.delete(tasks);
  console.log("✅ Cleaned up test data");

  // Build server
  const app = await buildServer();
  console.log("✅ Server built");

  // Start LISTEN for task changes
  await listenTaskChanges((payload) => {
    console.log(`  📡 LISTEN received: task=${payload.task_id}, status=${payload.status}`);
    pushSSE(payload.task_id, payload.status, payload);
    resolveWaiter(payload.task_id);
  });
  console.log("✅ LISTEN started");

  // Test: Sync link task
  console.log("\n--- Sending POST /api/v1/tasks (sync=true) ---");

  const syncPromise = app.inject({
    method: "POST",
    url: "/api/v1/tasks",
    headers: {
      authorization: "Bearer test-key",
      "content-type": "application/json",
    },
    payload: {
      input_url: "https://www.volcengine.com/docs/82379/1362931",
      model: "volcano-text",
      user_id: "sync_test_user",
      session_id: "sync_test_session",
      prompt: "请用一句话总结这个页面",
      sync: "true",
      timeout: "60",
    },
  });

  // Wait for task to be created (HEAD request in resolveInputType may take time)
  console.log("--- Waiting for task creation ---");
  let task: any;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    const allTasks = await db.select().from(tasks);
    if (allTasks.length > 0) {
      task = allTasks[0];
      console.log(`  ✅ Task found after ${(i + 1) * 0.5}s: ${task.id}, status=${task.status}, type=${task.inputType}`);
      break;
    }
  }

  if (!task) {
    console.error("❌ Task was not created within 15s");
    process.exit(1);
  }

  // Manually process the task (simulating worker)
  console.log("--- Simulating Worker Processing ---");

  if (!task) {
    console.error("❌ No task claimed");
    process.exit(1);
  }

  console.log(`  🔄 Processing task: ${task.id}, type: ${task.inputType}`);

  try {
    const result = await dispatchTask(task);
    await completeTask(task.id, result as unknown as Record<string, unknown>);
    await notifyTaskChange(task.id, "completed");
    console.log("  ✅ Task processed and notified");
  } catch (error: any) {
    console.error("  ❌ Task processing failed:", error.message);
    process.exit(1);
  }

  // Wait for sync response
  console.log("\n--- Waiting for sync response ---");
  const response = await syncPromise;

  const body = JSON.parse(response.payload);
  console.log("\n📥 Sync Response:");
  console.log(JSON.stringify(body, null, 2));

  if (body.code === 200 && body.data?.status === "completed") {
    console.log("\n✅ Sync mode test PASSED!");
    console.log("\n📝 Generated text:");
    console.log(body.data.result?.text || "(no text)");
  } else {
    console.log("\n❌ Sync mode test FAILED");
    console.log("Status:", body.data?.status);
    console.log("Error:", body.data?.error);
  }

  process.exit(0);
}

testSync().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
