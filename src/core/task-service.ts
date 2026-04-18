import { eq, desc, and, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { tasks, type Task, type NewTask } from "../db/schema.js";
import { InputType } from "../types/index.js";

export interface CreateTaskParams {
  userId?: string;
  sessionId?: string;
  inputType: InputType;
  inputData: Record<string, unknown>;
  model: string;
  prompt?: string;
  syncRequest?: boolean;
}

export async function createTask(params: CreateTaskParams): Promise<Task> {
  const newTask: NewTask = {
    userId: params.userId,
    sessionId: params.sessionId,
    inputType: params.inputType,
    inputData: params.inputData,
    model: params.model,
    prompt: params.prompt,
    syncRequest: params.syncRequest ?? false,
  };

  const [task] = await db.insert(tasks).values(newTask).returning();
  return task;
}

export async function getTaskById(id: string): Promise<Task | undefined> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return task;
}

export async function updateTaskStatus(
  id: string,
  status: Task["status"],
  updates?: Partial<Pick<Task, "result" | "error" | "retryCount" | "nextRetryAt">>
): Promise<void> {
  await db
    .update(tasks)
    .set({
      status,
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, id));
}

export async function listTasks(params: {
  userId?: string;
  sessionId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: Task[]; total: number }> {
  const page = params.page || 1;
  const pageSize = Math.min(params.pageSize || 20, 100);

  const conditions = [];
  if (params.userId) conditions.push(eq(tasks.userId, params.userId));
  if (params.sessionId) conditions.push(eq(tasks.sessionId, params.sessionId));
  if (params.status) conditions.push(eq(tasks.status, params.status));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db
    .select()
    .from(tasks)
    .where(where)
    .orderBy(desc(tasks.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(where);

  return { items, total: Number(countResult[0]?.count) || 0 };
}
