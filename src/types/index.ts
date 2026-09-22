export const ACCEPTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

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

export type PipelineStage =
  | "idle"
  | "validating"
  | "decoding"
  | "converting"
  | "done"
  | "error";

export type AppErrorCode =
  | "UNSUPPORTED_FILE"
  | "FILE_TOO_LARGE"
  | "DIMENSIONS_TOO_LARGE"
  | "CORRUPTED_FILE"
  | "DECODE_FAILED"
  | "VECTORIZE_FAILED"
  | "UNKNOWN";

export class AppError extends Error {
  code: AppErrorCode;
  constructor(code: AppErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AppError";
  }
}
