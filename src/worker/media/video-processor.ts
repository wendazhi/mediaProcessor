import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export async function extractVideoFrames(
  videoPath: string,
  options: { maxFrames?: number } = {}
): Promise<string[]> {
  const maxFrames = options.maxFrames || 5;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "video-"));

  try {
    const duration = await getVideoDuration(videoPath);

    const frameTimestamps = Array.from({ length: maxFrames }, (_, i) =>
      Math.floor((duration / (maxFrames + 1)) * (i + 1))
    );

    const framePaths: string[] = [];

    for (let i = 0; i < frameTimestamps.length; i++) {
      const outputPath = path.join(tempDir, `frame-${i}.jpg`);
      await extractFrame(videoPath, outputPath, frameTimestamps[i]);
      framePaths.push(outputPath);
    }

    const base64Frames = await Promise.all(
      framePaths.map(async (fp) => {
        const buffer = await fs.readFile(fp);
        return buffer.toString("base64");
      })
    );

    return base64Frames;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
}

function extractFrame(videoPath: string, outputPath: string, timestamp: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: [timestamp],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: "1280x720",
      })
      .on("end", resolve)
      .on("error", reject);
  });
}
