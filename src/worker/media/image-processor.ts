import sharp from "sharp";

const MAX_DIMENSION = 2048;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB for base64

export async function processImage(input: Buffer | string): Promise<string> {
  let buffer: Buffer;

  if (typeof input === "string") {
    const response = await fetch(input);
    buffer = Buffer.from(await response.arrayBuffer());
  } else {
    buffer = input;
  }

  let image = sharp(buffer);
  const metadata = await image.metadata();

  if ((metadata.width && metadata.width > MAX_DIMENSION) ||
      (metadata.height && metadata.height > MAX_DIMENSION)) {
    image = image.resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true });
  }

  let output = await image.jpeg({ quality: 85 }).toBuffer();

  if (output.length > MAX_FILE_SIZE) {
    output = await sharp(output).jpeg({ quality: 70 }).toBuffer();
  }

  return output.toString("base64");
}
