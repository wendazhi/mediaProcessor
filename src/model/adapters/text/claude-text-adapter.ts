import Anthropic from "@anthropic-ai/sdk";
import { ModelAdapter } from "../../types.js";
import { InputType, ProcessResult } from "../../../types/index.js";
import { config } from "../../../config/index.js";

export class ClaudeTextAdapter implements ModelAdapter {
  readonly modelId = "claude-text";
  readonly modelType = "text" as const;
  readonly supports: InputType[] = ["link"];

  private client = new Anthropic({ apiKey: config.anthropicApiKey });

  async process(params: {
    type: InputType;
    content: string | string[];
    prompt?: string;
  }): Promise<ProcessResult> {
    const text = Array.isArray(params.content) ? params.content.join("\n") : params.content;
    const userPrompt = params.prompt || "Summarize and analyze this content.";

    const response = await this.client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `${userPrompt}\n\n${text}`,
        },
      ],
    });

    const resultText = response.content
      .filter((c): c is Anthropic.Messages.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");

    return {
      text: resultText,
      usage: { tokens: response.usage?.input_tokens || 0 },
    };
  }
}
