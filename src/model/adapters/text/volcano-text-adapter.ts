import axios from "axios";
import { ModelAdapter } from "../../types.js";
import { InputType, ProcessResult } from "../../../types/index.js";
import { config } from "../../../config/index.js";

export class VolcanoTextAdapter implements ModelAdapter {
  readonly modelId = "volcano-text";
  readonly modelType = "text" as const;
  readonly supports: InputType[] = ["link"];

  async process(params: {
    type: InputType;
    content: string | string[];
    prompt?: string;
  }): Promise<ProcessResult> {
    const text = Array.isArray(params.content) ? params.content.join("\n") : params.content;
    const userPrompt = params.prompt || "请总结并分析以下内容。";

    const messages = [
      {
        role: "system",
        content: "你是由火山引擎提供的AI助手。",
      },
      {
        role: "user",
        content: `${userPrompt}\n\n${text}`,
      },
    ];

    const response = await axios.post(
      `${config.volcanoBaseUrl}/chat/completions`,
      {
        model: config.volcanoTextEndpoint,
        messages,
        max_tokens: 4096,
      },
      {
        headers: {
          Authorization: `Bearer ${config.volcanoApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 120000,
      }
    );

    const resultText = response.data.choices?.[0]?.message?.content || "";
    const tokens = response.data.usage?.prompt_tokens || 0;

    return {
      text: resultText,
      usage: { tokens },
    };
  }
}
