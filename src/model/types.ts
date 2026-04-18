import { InputType, ProcessResult } from "../types/index.js";

export interface ModelAdapter {
  readonly modelId: string;
  readonly modelType: "vision" | "audio" | "text";
  readonly supports: InputType[];
  process(params: {
    type: InputType;
    content: string | string[];
    prompt?: string;
  }): Promise<ProcessResult>;
}
