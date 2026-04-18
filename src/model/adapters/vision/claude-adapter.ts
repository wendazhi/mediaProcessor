import Anthropic from "@anthropic-ai/sdk";
import { ModelAdapter } from "../../types.js";
import { InputType, ProcessResult } from "../../../types/index.js";
import { config } from "../../../config/index.js";

export class ClaudeVisionAdapter implements ModelAdapter {
  readonly modelId = "claude-sonnet-4-6";
  readonly modelType = "vision" as const;
  readonly supports: InputType[] = ["image", "video", "link"];

  private client = new Anthropic({ apiKey: config.anthropicApiKey });

  async process(params: {
    type: InputType;
    content: string | string[];
    prompt?: string;
  }): Promise<ProcessResult> {
    const images = Array.isArray(params.content) ? params.content : [params.content];
    const userPrompt = params.prompt || "Describe this content in detail.";

    const content: Anthropic.Messages.ContentBlockParam[] = [
      { type: "text", text: userPrompt },
      ...images.map((img) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: "image/jpeg" as const,
          data: img,
        },
      })),
    ];

    const response = await this.client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      messages: [{ role: "user", content }],
    });

    const text = response.content
      .filter((c): c is Anthropic.Messages.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");

    return {
      text,
      usage: { tokens: response.usage?.input_tokens || 0 },
    };
  }
}
