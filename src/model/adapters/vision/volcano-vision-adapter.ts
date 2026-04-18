import axios from "axios";
import { ModelAdapter } from "../../types.js";
import { InputType, ProcessResult } from "../../../types/index.js";
import { config } from "../../../config/index.js";

export class VolcanoVisionAdapter implements ModelAdapter {
  readonly modelId = "volcano-vision";
  readonly modelType = "vision" as const;
  readonly supports: InputType[] = ["image", "video", "link"];

  async process(params: {
    type: InputType;
    content: string | string[];
    prompt?: string;
  }): Promise<ProcessResult> {
    const images = Array.isArray(params.content) ? params.content : [params.content];
    const userPrompt = params.prompt || "请详细描述这张图片的内容。";

    const messages: any[] = [
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          ...images.map((img) => ({
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${img}`,
            },
          })),
        ],
      },
    ];

    const response = await axios.post(
      `${config.volcanoBaseUrl}/chat/completions`,
      {
        model: config.volcanoVisionEndpoint,
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

    const text = response.data.choices?.[0]?.message?.content || "";
    const tokens = response.data.usage?.prompt_tokens || 0;

    return {
      text,
      usage: { tokens },
    };
  }
}
