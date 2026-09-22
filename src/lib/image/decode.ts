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
    // The browser could read the file but not decode it as image data — this
    // is a property of the file itself, not the browser's capabilities.
    throw new AppError(
      "CORRUPTED_FILE",
      "This image couldn't be read — it may be corrupted or saved in an unsupported way.",
      "Try exporting or saving the image again, then upload it."
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
    // The file was fine — this browser/environment can't give us a 2D canvas
    // context at all, which is a browser capability problem, not the file's fault.
    throw new AppError(
      "BROWSER_UNSUPPORTED",
      "Your browser doesn't support the image processing this conversion needs.",
      "Try a recent version of Chrome, Firefox, Safari, or Edge."
    );
  }
  ctx.drawImage(bitmap, 0, 0, processedWidth, processedHeight);
  bitmap.close();

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, processedWidth, processedHeight);
  } catch {
    throw new AppError(
      "BROWSER_UNSUPPORTED",
      "Your browser blocked reading the image after decoding it.",
      "Try a recent version of Chrome, Firefox, Safari, or Edge."
    );
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
