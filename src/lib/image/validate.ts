import { ACCEPTED_MIME_TYPES, AppError } from "../../types";

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
export const MAX_DECODED_DIMENSION = 8000; // px, longest side, pre-downsample
export const MAX_DECODED_PIXELS = 40_000_000; // ~40MP guards against extreme aspect ratios

export function validateFile(file: File): void {
  if (!ACCEPTED_MIME_TYPES.includes(file.type as (typeof ACCEPTED_MIME_TYPES)[number])) {
    throw new AppError(
      "UNSUPPORTED_FILE",
      "That file type isn't supported. Use PNG, JPG, JPEG, or WebP."
    );
  }
  if (file.size === 0) {
    throw new AppError("CORRUPTED_FILE", "That file appears to be empty or corrupted.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new AppError(
      "FILE_TOO_LARGE",
      `That file is too large (max ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)}MB).`
    );
  }
}

export function validateDimensions(width: number, height: number): void {
  if (width <= 0 || height <= 0) {
    throw new AppError("CORRUPTED_FILE", "That image has invalid dimensions.");
  }
  if (width > MAX_DECODED_DIMENSION || height > MAX_DECODED_DIMENSION) {
    throw new AppError(
      "DIMENSIONS_TOO_LARGE",
      `That image is too large (max ${MAX_DECODED_DIMENSION}px per side).`
    );
  }
  if (width * height > MAX_DECODED_PIXELS) {
    throw new AppError("DIMENSIONS_TOO_LARGE", "That image has too many pixels to process.");
  }
}
