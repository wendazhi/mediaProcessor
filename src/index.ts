import { startServer } from "./api/server.js";
import { config } from "./config/index.js";

startServer().catch((err) => {
  console.error("Server failed to start:", err);
  process.exit(1);
});
