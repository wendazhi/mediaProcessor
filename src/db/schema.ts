import { pgTable, uuid, varchar, text, jsonb, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 64 }),
  sessionId: varchar("session_id", { length: 64 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  inputType: varchar("input_type", { length: 20 }).notNull(),
  inputData: jsonb("input_data").notNull(),
  result: jsonb("result"),
  model: varchar("model", { length: 50 }).notNull(),
  prompt: text("prompt"),
  error: text("error"),
  syncRequest: boolean("sync_request").notNull().default(false),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
