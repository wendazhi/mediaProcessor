import { InputType } from "../types/index.js";
import axios from "axios";

const URL_TYPE_MAP: Record<string, InputType> = {
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image",
  ".gif": "image",
  ".webp": "image",
  ".mp4": "video",
  ".mov": "video",
  ".avi": "video",
  ".mp3": "audio",
  ".wav": "audio",
  ".flac": "audio",
  ".m4a": "audio",
};

export async function resolveInputType(
  url: string,
  explicitType?: string
): Promise<InputType> {
  if (explicitType) {
    if (["image", "video", "audio", "link"].includes(explicitType)) {
      return explicitType as InputType;
    }
    throw new Error(`Unsupported input_type: ${explicitType}`);
  }

  // Handle base64 data URI
  if (url.startsWith("data:")) {
    const mimeMatch = url.match(/^data:([^;]+);/);
    const mime = mimeMatch?.[1] || "";
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    throw new Error(`Cannot resolve type for data URI: ${mime}`);
  }

  return await resolveUrlType(url);
}

async function resolveUrlType(url: string): Promise<InputType> {
  try {
    const response = await axios.head(url, {
      timeout: 10000,
      maxRedirects: 5,
    });
    const contentType = response.headers["content-type"] || "";

    if (contentType.startsWith("image/")) return "image";
    if (contentType.startsWith("video/")) return "video";
    if (contentType.startsWith("audio/")) return "audio";
    if (contentType.includes("text/html")) return "link";
  } catch {
    // HEAD failed, fallback to extension
  }

  const lowerUrl = url.toLowerCase();
  for (const [ext, type] of Object.entries(URL_TYPE_MAP)) {
    if (lowerUrl.endsWith(ext)) return type;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return "link";
  }

  throw new Error(`Cannot resolve type for URL: ${url}`);
}
