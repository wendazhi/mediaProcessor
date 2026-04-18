export type InputType = "image" | "video" | "audio" | "link";
export type TaskStatus = "pending" | "processing" | "completed" | "failed";

export interface TaskResult {
  text: string;
  structured?: Record<string, unknown>;
  usage?: { tokens: number };
}

export interface ProcessParams {
  type: InputType;
  content: string | string[];
  prompt?: string;
  options?: Record<string, unknown>;
}

export interface ProcessResult {
  text: string;
  structured?: Record<string, unknown>;
  usage?: { tokens: number };
}

export interface ModelInfo {
  id: string;
  type: "vision" | "audio" | "text";
  supports: InputType[];
}

export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}
