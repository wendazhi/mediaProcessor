import { claimTask, completeTask, failTask, resetStaleTasks } from "../db/queue.js";
import { dispatchTask } from "./task-dispatcher.js";
import { config } from "../config/index.js";
import { pushSSE } from "../core/sse-manager.js";
import { notifyTaskChange } from "../db/notify.js";

let running = true;

export async function startWorker(): Promise<void> {
  console.log("Worker started");

  // Reset stale tasks on startup
  await resetStaleTasks(5);

  while (running) {
    try {
      const task = await claimTask();

      if (!task) {
        await sleep(config.workerPollIntervalMs);
        continue;
      }

      console.log(`Processing task: ${task.id}, type: ${task.inputType}`);

      try {
        const result = await dispatchTask(task);
        await completeTask(task.id, result);
        await notifyTaskChange(task.id, "completed");
        pushSSE(task.id, "completed", {
          task_id: task.id,
          status: "completed",
          result,
        });
        console.log(`Task completed: ${task.id}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Task failed: ${task.id}, error: ${errorMessage}`);
        await failTask(task.id, errorMessage);
        await notifyTaskChange(task.id, "failed");
        pushSSE(task.id, "failed", {
          task_id: task.id,
          status: "failed",
          error: errorMessage,
        });
      }
    } catch (error) {
      console.error("Worker loop error:", error);
      await sleep(config.workerPollIntervalMs);
    }
  }
}

export function stopWorker(): void {
  running = false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
