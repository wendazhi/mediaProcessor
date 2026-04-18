import { db } from "./client.js";

export async function notifyTaskChange(taskId: string, status: string): Promise<void> {
  const payload = JSON.stringify({ task_id: taskId, status });
  await db.execute(`NOTIFY task_status_change, '${payload}'`);
}

export async function listenTaskChanges(
  callback: (payload: { task_id: string; status: string }) => void
): Promise<void> {
  const pool = (db as any).$client as import("pg").Pool;
  const client = await pool.connect();

  await client.query("LISTEN task_status_change");

  client.on("notification", (msg) => {
    if (msg.payload) {
      try {
        const data = JSON.parse(msg.payload);
        callback(data);
      } catch {
        // ignore invalid payload
      }
    }
  });
}
