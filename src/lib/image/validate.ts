import { ACCEPTED_EXTENSIONS, ACCEPTED_MIME_TYPES, AppError } from "../../types";

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
export const MAX_DECODED_DIMENSION = 8000; // px, longest side, pre-downsample
export const MAX_DECODED_PIXELS = 40_000_000; // ~40MP guards against extreme aspect ratios

function getExtension(filename: string): string {
  const match = /\.[^./\\]+$/.exec(filename);
  return match ? match[0].toLowerCase() : "";
}

export function validateFile(file: File): void {
  const mime = file.type;
  const isAcceptedMime = ACCEPTED_MIME_TYPES.includes(mime as (typeof ACCEPTED_MIME_TYPES)[number]);

  if (mime) {
    // MIME is present: it's the authoritative signal. A mismatched extension
    // (e.g. a mislabeled .txt renamed to .png) does NOT get a pass here —
    // decodability is checked separately and will still catch real corruption.
    if (!isAcceptedMime) {
      throw new AppError(
        "UNSUPPORTED_FILE",
        "This file type isn't supported.",
        "Use a PNG, JPG, JPEG, or WebP image instead."
      );
    }
  } else {
    // No MIME available (some file managers/drag sources omit it) — fall
    // back to the extension. This is a fallback, not the primary check.
    const isAcceptedExt = ACCEPTED_EXTENSIONS.includes(
      getExtension(file.name) as (typeof ACCEPTED_EXTENSIONS)[number]
    );
    if (!isAcceptedExt) {
      throw new AppError(
        "UNSUPPORTED_FILE",
        "This file type isn't supported.",
        "Use a PNG, JPG, JPEG, or WebP image instead."
      );
    }
  }

  if (file.size === 0) {
    throw new AppError(
      "CORRUPTED_FILE",
      "This file appears to be empty or corrupted.",
      "Try exporting or saving the image again, then upload it."
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new AppError(
      "FILE_TOO_LARGE",
      `This file is too large to process in your browser (max ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)}MB).`,
      "Try compressing it or choosing a smaller file."
    );
  }
}

export function validateDimensions(width: number, height: number): void {
  if (width <= 0 || height <= 0) {
    throw new AppError(
      "CORRUPTED_FILE",
      "This image has invalid dimensions.",
      "Try exporting or saving the image again, then upload it."
    );
  }
  if (width > MAX_DECODED_DIMENSION || height > MAX_DECODED_DIMENSION) {
    throw new AppError(
      "DIMENSIONS_TOO_LARGE",
      `This image is too large to process in your browser (max ${MAX_DECODED_DIMENSION}px per side).`,
      "Try a smaller image, or resize it before uploading."
    );
  }
  if (width * height > MAX_DECODED_PIXELS) {
    throw new AppError(
      "DIMENSIONS_TOO_LARGE",
      "This image has too many pixels to process in your browser.",
      "Try a smaller image, or resize it before uploading."
    );
  }
}
