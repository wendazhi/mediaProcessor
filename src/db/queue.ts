import { eq, sql, and, or, lte, isNull, asc } from "drizzle-orm";
import { db } from "./client.js";
import { tasks, type Task } from "./schema.js";

export async function claimTask(): Promise<Task | undefined> {
  return await db.transaction(async (tx) => {
    // Step 1: Select pending task with FOR UPDATE SKIP LOCKED
    const [task] = await tx
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, "pending"),
          or(isNull(tasks.nextRetryAt), lte(tasks.nextRetryAt, sql`NOW()`))
        )
      )
      .orderBy(asc(tasks.createdAt))
      .for("update", { skipLocked: true })
      .limit(1);

    if (!task) return undefined;

    // Step 2: Update status to processing
    await tx
      .update(tasks)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(tasks.id, task.id));

    return task;
  });
}

export async function completeTask(
  taskId: string,
  result: object
): Promise<void> {
  await db
    .update(tasks)
    .set({
      status: "completed",
      result,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));
}

export async function failTask(taskId: string, error: string): Promise<void> {
  const [task] = await db
    .select({ retryCount: tasks.retryCount, maxRetries: tasks.maxRetries })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (task && task.retryCount < task.maxRetries) {
    const retryCount = task.retryCount + 1;
    const nextRetryAt = new Date(Date.now() + Math.pow(2, retryCount) * 1000);

    await db
      .update(tasks)
      .set({
        status: "pending",
        retryCount,
        nextRetryAt,
        error,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
  } else {
    await db
      .update(tasks)
      .set({
        status: "failed",
        error,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
  }
}

export async function resetStaleTasks(timeoutMinutes: number = 5): Promise<void> {
  await db.execute(sql`
    UPDATE ${tasks}
    SET status = 'pending', updated_at = NOW()
    WHERE status = 'processing'
      AND updated_at < NOW() - INTERVAL '${sql.raw(String(timeoutMinutes))} minutes'
  `);
}

