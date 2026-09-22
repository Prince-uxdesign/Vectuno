import { AppError, type DecodedImage } from "../../types";
import { validateDimensions } from "./validate";

// Measured on a 4000x3000 synthetic test image: ~5.8s of main-thread tracing work.
// Downsampling before vectorization keeps conversions fast and SVGs reasonably
// sized; full resolution rarely improves a traced (not photographic) result anyway.
export const DEFAULT_MAX_PROCESS_DIMENSION = 2000;

export async function decodeImage(
  file: File,
  maxProcessDimension: number = DEFAULT_MAX_PROCESS_DIMENSION
): Promise<DecodedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new AppError(
      "DECODE_FAILED",
      "That image couldn't be decoded. It may be corrupted or in an unsupported format."
    );
  }

  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  validateDimensions(originalWidth, originalHeight);

  const longestSide = Math.max(originalWidth, originalHeight);
  const scale = longestSide > maxProcessDimension ? maxProcessDimension / longestSide : 1;
  const processedWidth = Math.max(1, Math.round(originalWidth * scale));
  const processedHeight = Math.max(1, Math.round(originalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = processedWidth;
  canvas.height = processedHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new AppError("DECODE_FAILED", "This browser can't process images (canvas unavailable).");
  }
  ctx.drawImage(bitmap, 0, 0, processedWidth, processedHeight);
  bitmap.close();

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, processedWidth, processedHeight);
  } catch {
    throw new AppError("DECODE_FAILED", "That image couldn't be read after decoding.");
  }

  return {
    imageData,
    originalWidth,
    originalHeight,
    processedWidth,
    processedHeight,
    wasDownsampled: scale < 1,
  };
}
