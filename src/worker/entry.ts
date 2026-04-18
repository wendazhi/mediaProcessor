import "dotenv/config";
import { startWorker } from "./worker.js";
import { initModelAdapters } from "../model/init.js";

initModelAdapters();

process.on("SIGINT", () => {
  console.log("Shutting down worker...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Shutting down worker...");
  process.exit(0);
});

startWorker().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
