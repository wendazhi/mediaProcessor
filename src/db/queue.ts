import { eq, sql, and, lte, isNull } from "drizzle-orm";
import { db } from "./client.js";
import { tasks, type Task } from "./schema.js";

export async function claimTask(): Promise<Task | undefined> {
  const result = await db.execute<Task[]>(sql`
    WITH claimed AS (
      SELECT id
      FROM ${tasks}
      WHERE status = 'pending'
        AND (${isNull(tasks.nextRetryAt)} OR ${lte(tasks.nextRetryAt, sql`NOW()`)})
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE ${tasks}
    SET status = 'processing', updated_at = NOW()
    FROM claimed
    WHERE ${tasks.id} = claimed.id
    RETURNING ${tasks}.*
  `);

  return result.rows[0];
}

export async function completeTask(
  taskId: string,
  result: Record<string, unknown>
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
