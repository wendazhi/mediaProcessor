import { fetchLinkContent } from "../media/link-fetcher.js";
import { getAdapter } from "../../model/model-registry.js";
import { ProcessResult } from "../../types/index.js";
import { Task } from "../../db/schema.js";

export async function handleLink(task: Task): Promise<ProcessResult> {
  const inputData = task.inputData as { url: string };
  const adapter = getAdapter(task.model);

  if (!adapter) {
    throw new Error(`Model adapter not found: ${task.model}`);
  }

  const { text, truncated } = await fetchLinkContent(inputData.url);

  const result = await adapter.process({
    type: "link",
    content: text,
    prompt: task.prompt || undefined,
  });

  if (truncated) {
    result.structured = { ...(result.structured || {}), content_truncated: true };
  }

  return result;
}
