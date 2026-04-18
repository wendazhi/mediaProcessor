import { Task } from "../db/schema.js";
import { handleLink } from "./handlers/link-handler.js";
import { handleImage } from "./handlers/image-handler.js";
import { handleVideo } from "./handlers/video-handler.js";
import { ProcessResult } from "../types/index.js";

export async function dispatchTask(task: Task): Promise<ProcessResult> {
  switch (task.inputType) {
    case "link":
      return handleLink(task);
    case "image":
      return handleImage(task);
    case "video":
      return handleVideo(task);
    case "audio":
      throw new Error("Audio handling not yet implemented");
    default:
      throw new Error(`Unknown input type: ${task.inputType}`);
  }
}
