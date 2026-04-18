import { registerAdapter } from "./model-registry.js";
import { ClaudeVisionAdapter } from "./adapters/vision/claude-adapter.js";
import { ClaudeTextAdapter } from "./adapters/text/claude-text-adapter.js";
import { VolcanoVisionAdapter } from "./adapters/vision/volcano-vision-adapter.js";
import { VolcanoTextAdapter } from "./adapters/text/volcano-text-adapter.js";

export function initModelAdapters(): void {
  registerAdapter(new ClaudeVisionAdapter());
  registerAdapter(new ClaudeTextAdapter());
  registerAdapter(new VolcanoVisionAdapter());
  registerAdapter(new VolcanoTextAdapter());
}
