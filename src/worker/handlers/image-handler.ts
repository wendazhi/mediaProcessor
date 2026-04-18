import { processImage } from "../media/image-processor.js";
import { getAdapter } from "../../model/model-registry.js";
import { ProcessResult } from "../../types/index.js";
import { Task } from "../../db/schema.js";
import axios from "axios";

export async function handleImage(task: Task): Promise<ProcessResult> {
  const inputData = task.inputData as { url: string };
  const adapter = getAdapter(task.model);

  if (!adapter) {
    throw new Error(`Model adapter not found: ${task.model}`);
  }

  const response = await axios.get(inputData.url, { responseType: "arraybuffer", timeout: 30000 });
  const base64Image = await processImage(Buffer.from(response.data));

  return adapter.process({
    type: "image",
    content: base64Image,
    prompt: task.prompt || undefined,
  });
}
