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

    const response = await axios.post(
      `${config.volcanoBaseUrl}/responses`,
      {
        model: config.volcanoTextModel,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `${userPrompt}\n\n${text}`,
              },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${config.volcanoApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 120000,
      }
    );

    // Extract text from response
    const output = response.data.output || [];
    const assistantMsg = output.find((m: any) => m.role === "assistant");
    const resultText = assistantMsg?.content?.find((c: any) => c.type === "output_text")?.text || "";

    return {
      text: resultText,
      usage: { tokens: response.data.usage?.total_tokens || 0 },
    };
  }
}
