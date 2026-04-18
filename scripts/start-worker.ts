import { startWorker } from "../src/worker/worker.js";
import { initModelAdapters } from "../src/model/init.js";

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
