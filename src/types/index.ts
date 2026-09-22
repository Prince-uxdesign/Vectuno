export const ACCEPTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

// Fallback for files whose MIME type is missing/empty (some OS file pickers
// and drag sources omit it). Never used to override a MIME type that IS
// present but unsupported — see validateFile.
export const ACCEPTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;

export type ColorMode = "color" | "bw";
export type DetailLevel = "low" | "medium" | "high";

export interface ConversionOptions {
  colorMode: ColorMode;
  numberOfColors: number; // 2-64, ignored when colorMode === "bw"
  detail: DetailLevel; // controls path/quad thresholds
  smoothing: number; // 0-1, higher = smoother/simpler paths
}

export const DEFAULT_OPTIONS: ConversionOptions = {
  colorMode: "color",
  numberOfColors: 16,
  detail: "medium",
  smoothing: 0.5,
};

export interface DecodedImage {
  imageData: ImageData;
  originalWidth: number;
  originalHeight: number;
  processedWidth: number;
  processedHeight: number;
  wasDownsampled: boolean;
}

export interface ConversionResult {
  svg: string;
  sizeBytes: number;
  pathCount: number;
  elapsedMs: number;
}

// The application's explicit state model. One field, one source of truth —
// every screen renders off `stage`, not a combination of booleans.
export type Stage =
  | "empty" // no file, nothing happening
  | "dragActive" // no file, a drag is hovering the drop zone
  | "fileSelected" // a file was just picked, validation hasn't started yet
  | "preparing" // validating + decoding the file
  | "ready" // decoded successfully, waiting for the user to hit Convert
  | "converting" // vectorization running in the worker
  | "success" // SVG produced
  | "error"; // something failed; errorMessage explains what and errorAction how to recover

export type AppErrorCode =
  | "UNSUPPORTED_FILE"
  | "FILE_TOO_LARGE"
  | "DIMENSIONS_TOO_LARGE"
  | "CORRUPTED_FILE"
  | "DECODE_FAILED"
  | "VECTORIZE_FAILED"
  | "UNKNOWN";

// What a user can actually do about an error: retry the same operation
// (transient/engine failure) or pick a different file (the file is the problem).
export type ErrorRecovery = "retry" | "chooseNew";

const RECOVERY_BY_CODE: Record<AppErrorCode, ErrorRecovery> = {
  UNSUPPORTED_FILE: "chooseNew",
  FILE_TOO_LARGE: "chooseNew",
  DIMENSIONS_TOO_LARGE: "chooseNew",
  CORRUPTED_FILE: "chooseNew",
  DECODE_FAILED: "chooseNew",
  VECTORIZE_FAILED: "retry",
  UNKNOWN: "chooseNew",
};

export class AppError extends Error {
  code: AppErrorCode;
  recovery: ErrorRecovery;
  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.code = code;
    this.recovery = RECOVERY_BY_CODE[code];
    this.name = "AppError";
  }
}
