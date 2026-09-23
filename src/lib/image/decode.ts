import { AppError, type DecodedImage } from "../../types";
import { validateDimensions } from "./validate";
import { sniffImageType } from "./sniff";
import { hasTransparency } from "./transparency";

// Measured on a 4000x3000 synthetic test image: ~5.8s of main-thread tracing work.
// Downsampling before vectorization keeps conversions fast and SVGs reasonably
// sized; full resolution rarely improves a traced (not photographic) result anyway.
export const DEFAULT_MAX_PROCESS_DIMENSION = 2000;

export async function decodeImage(
  file: File,
  maxProcessDimension: number = DEFAULT_MAX_PROCESS_DIMENSION
): Promise<DecodedImage> {
  // Trust the bytes, not the name or declared MIME: a renamed text file or a
  // paste with no type must be rejected here, and a JPEG saved as ".png"
  // should be reported (and treated) as the JPEG it really is.
  const detectedMime = await sniffImageType(file);
  if (!detectedMime) {
    throw new AppError(
      "CORRUPTED_FILE",
      "Vectuno couldn't read this image.",
      "The file doesn't look like a real PNG, JPG, or WebP. Try exporting it again, then upload it."
    );
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // The browser could read the file but not decode it as image data — this
    // is a property of the file itself, not the browser's capabilities.
    throw new AppError(
      "CORRUPTED_FILE",
      "Vectuno couldn't read this image.",
      "It may be corrupted or saved in an unsupported way. Try exporting it again, then upload it."
    );
  }

  try {
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
    // NOTE: No pre-blur is applied (not even for JPEG). A canvas blur was
    // previously used here to suppress JPEG noise, but testing showed it
    // does more harm than good on flat art: it bleeds high-contrast edges
    // (e.g. black on yellow) into wide gradient bands, which the tracer
    // then quantizes into extra dull intermediate colors — exactly the
    // "washed-out + speckled" look. Speckle is handled downstream instead
    // (higher pathomit + deterministic tiny-path strip in optimizeSvg),
    // which removes dots without touching real edge colors.
    ctx.drawImage(bitmap, 0, 0, processedWidth, processedHeight);

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
      detectedMime,
      // JPEG has no alpha channel, so skip the scan.
      hasTransparency: detectedMime !== "image/jpeg" && hasTransparency(imageData),
    };
  } finally {
    bitmap.close();
  }
}
