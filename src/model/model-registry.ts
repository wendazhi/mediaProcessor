import { ModelAdapter } from "./types.js";
import { InputType } from "../types/index.js";

const adapters = new Map<string, ModelAdapter>();

export function registerAdapter(adapter: ModelAdapter): void {
  adapters.set(adapter.modelId, adapter);
}

export function getAdapter(modelId: string): ModelAdapter | undefined {
  return adapters.get(modelId);
}

export function getAllAdapters(): ModelAdapter[] {
  return Array.from(adapters.values());
}

export function findAdaptersForType(inputType: InputType): ModelAdapter[] {
  return getAllAdapters().filter((a) => a.supports.includes(inputType));
}

export function getAvailableModels() {
  return getAllAdapters().map((a) => ({
    id: a.modelId,
    type: a.modelType,
    supports: a.supports,
  }));
}
