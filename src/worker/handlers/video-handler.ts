import { extractVideoFrames } from "../media/video-processor.js";
import { getAdapter } from "../../model/model-registry.js";
import { ProcessResult } from "../../types/index.js";
import { Task } from "../../db/schema.js";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import os from "os";

export async function handleVideo(task: Task): Promise<ProcessResult> {
  const inputData = task.inputData as { url?: string; filePath?: string };
  const adapter = getAdapter(task.model);

  if (!adapter) {
    throw new Error(`Model adapter not found: ${task.model}`);
  }

  let videoPath: string;

  if (inputData.url) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "video-dl-"));
    videoPath = path.join(tempDir, "video.mp4");
    const response = await axios.get(inputData.url, {
      responseType: "arraybuffer",
      timeout: 60000,
    });
    await fs.writeFile(videoPath, Buffer.from(response.data));
  } else {
    throw new Error("File upload processing not yet implemented");
  }

  try {
    const frames = await extractVideoFrames(videoPath);

    return adapter.process({
      type: "video",
      content: frames,
      prompt: task.prompt || "Describe what happens in this video based on these frames.",
    });
  } finally {
    await fs.rm(path.dirname(videoPath), { recursive: true, force: true }).catch(() => {});
  }
}
