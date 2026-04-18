import { InputType } from "../types/index.js";
import axios from "axios";

const IMAGE_MAGIC = [
  { bytes: [0xff, 0xd8], type: "image" as InputType },
  { bytes: [0x89, 0x50], type: "image" as InputType },
  { bytes: [0x47, 0x49], type: "image" as InputType },
  { bytes: [0x52, 0x49], type: "image" as InputType },
];

const VIDEO_MAGIC = [
  { bytes: [0x66, 0x74], type: "video" as InputType },
  { bytes: [0x00, 0x00], type: "video" as InputType },
];

const AUDIO_MAGIC = [
  { bytes: [0x49, 0x44], type: "audio" as InputType },
  { bytes: [0x66, 0x4c], type: "audio" as InputType },
  { bytes: [0x52, 0x49], type: "audio" as InputType },
];

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
  input: { url?: string; file?: { buffer: Buffer; mimetype?: string } },
  explicitType?: string
): Promise<InputType> {
  if (explicitType) {
    if (["image", "video", "audio", "link"].includes(explicitType)) {
      return explicitType as InputType;
    }
    throw new Error(`Unsupported input_type: ${explicitType}`);
  }

  if (input.url) {
    return await resolveUrlType(input.url);
  }

  if (input.file) {
    return resolveFileType(input.file.buffer, input.file.mimetype);
  }

  throw new Error("No input provided");
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

function resolveFileType(buffer: Buffer, mimetype?: string): InputType {
  if (mimetype) {
    if (mimetype.startsWith("image/")) return "image";
    if (mimetype.startsWith("video/")) return "video";
    if (mimetype.startsWith("audio/")) return "audio";
  }

  const header = Array.from(buffer.slice(0, 16));

  for (const magic of IMAGE_MAGIC) {
    if (header[0] === magic.bytes[0] && header[1] === magic.bytes[1]) {
      return magic.type;
    }
  }

  for (const magic of VIDEO_MAGIC) {
    if (header[0] === magic.bytes[0] && header[1] === magic.bytes[1]) {
      return magic.type;
    }
  }

  for (const magic of AUDIO_MAGIC) {
    if (header[0] === magic.bytes[0] && header[1] === magic.bytes[1]) {
      return magic.type;
    }
  }

  throw new Error("Cannot resolve file type from magic bytes");
}
