import { getTaskById } from "./task-service.js";
import { Task } from "../db/schema.js";

const waiters = new Map<string, { resolve: (task: Task) => void; reject: (err: Error) => void }>();

export function registerWaiter(taskId: string): Promise<Task> {
  return new Promise((resolve, reject) => {
    waiters.set(taskId, { resolve, reject });

    // Timeout cleanup
    setTimeout(() => {
      if (waiters.has(taskId)) {
        waiters.delete(taskId);
        reject(new Error("Sync wait timeout"));
      }
    }, 120000);
  });
}

export function resolveWaiter(taskId: string): void {
  const waiter = waiters.get(taskId);
  if (!waiter) return;

  getTaskById(taskId).then((task) => {
    if (task) waiter.resolve(task);
    waiters.delete(taskId);
  });
}

export function rejectWaiter(taskId: string, error: Error): void {
  const waiter = waiters.get(taskId);
  if (!waiter) return;

  waiter.reject(error);
  waiters.delete(taskId);
}
