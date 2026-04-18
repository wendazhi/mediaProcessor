import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const API_KEY = process.env.VOLCANO_API_KEY;
const MODEL = process.env.VOLCANO_VISION_MODEL;
const BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

async function testVision() {
  console.log("=== Testing Volcano Vision API ===");
  console.log(`Model: ${MODEL}`);

  try {
    const response = await axios.post(
      `${BASE_URL}/responses`,
      {
        model: MODEL,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_image",
                image_url: "https://ark-project.tos-cn-beijing.volces.com/doc_image/ark_demo_img_1.png",
              },
              {
                type: "input_text",
                text: "你看见了什么？",
              },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 120000,
      }
    );

    console.log("\n✅ Vision API Success!");
    console.log("\nResponse structure:");
    console.log(JSON.stringify(response.data, null, 2));

    // Extract text
    const output = response.data.output || [];
    const assistantMsg = output.find((m: any) => m.role === "assistant");
    const text = assistantMsg?.content?.find((c: any) => c.type === "output_text")?.text || "";

    console.log("\n📝 Generated text:");
    console.log(text);

  } catch (error: any) {
    console.error("\n❌ Vision API Failed!");
    console.error("Status:", error.response?.status);
    console.error("Error:", error.response?.data || error.message);
  }
}

async function testText() {
  console.log("\n\n=== Testing Volcano Text API ===");

  try {
    const response = await axios.post(
      `${BASE_URL}/responses`,
      {
        model: MODEL,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "请用一句话介绍北京。",
              },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 120000,
      }
    );

    console.log("\n✅ Text API Success!");

    const output = response.data.output || [];
    const assistantMsg = output.find((m: any) => m.role === "assistant");
    const text = assistantMsg?.content?.find((c: any) => c.type === "output_text")?.text || "";

    console.log("\n📝 Generated text:");
    console.log(text);

  } catch (error: any) {
    console.error("\n❌ Text API Failed!");
    console.error("Status:", error.response?.status);
    console.error("Error:", error.response?.data || error.message);
  }
}

async function main() {
  if (!API_KEY) {
    console.error("VOLCANO_API_KEY not set in .env");
    process.exit(1);
  }
  if (!MODEL) {
    console.error("VOLCANO_VISION_MODEL not set in .env");
    process.exit(1);
  }

  await testVision();
  await testText();
}

main();
