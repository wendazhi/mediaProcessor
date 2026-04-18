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

    // Build content array: images + text
    const content: any[] = [];

    for (const img of images) {
      // img is base64 string, construct data URI
      content.push({
        type: "input_image",
        image_url: `data:image/jpeg;base64,${img}`,
      });
    }

    content.push({
      type: "input_text",
      text: userPrompt,
    });

    const response = await axios.post(
      `${config.volcanoBaseUrl}/responses`,
      {
        model: config.volcanoVisionModel,
        input: [
          {
            role: "user",
            content,
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
    const text = assistantMsg?.content?.find((c: any) => c.type === "output_text")?.text || "";

    return {
      text,
      usage: { tokens: response.data.usage?.total_tokens || 0 },
    };
  }
}
