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

// Shared `accept` attribute value for every file input in the app — kept in
// one place so UploadZone and BatchWorkspace can't drift on which types they
// accept.
export const ACCEPT_ATTRIBUTE = [...ACCEPTED_MIME_TYPES, ...ACCEPTED_EXTENSIONS].join(",");

// The four ways a designer can ask for a conversion. Each maps to a full
// engine configuration (see lib/engine/presets.ts) — none is cosmetic.
export type PresetId = "clean" | "balanced" | "detailed" | "monochrome";

export const DEFAULT_PRESET: PresetId = "balanced";

export interface ConversionOptions {
  preset: PresetId;
  // Advanced: a fixed number of colors (2-64), or null to let the preset
  // decide from the image. Ignored by the Monochrome preset.
  colorCount: number | null;
}

// A factory, not a shared constant object: useConverter and useBatchConverter
// each use this as their initial `options` value.
export function createDefaultOptions(): ConversionOptions {
  return { preset: DEFAULT_PRESET, colorCount: null };
}

export interface DecodedImage {
  imageData: ImageData;
  originalWidth: number;
  originalHeight: number;
  processedWidth: number;
  processedHeight: number;
  wasDownsampled: boolean;
  // Verified from the file's actual bytes (magic numbers), not its name or
  // declared MIME — so the type shown to the user is the type it really is.
  detectedMime: AcceptedMimeType;
  // True only if at least one decoded pixel is not fully opaque.
  hasTransparency: boolean;
}

// Preview-only backdrop behind a (possibly transparent) image or SVG. It is
// applied purely as CSS on the preview frame and never touches image data or
// the generated SVG.
export type PreviewBackground = "checker" | "white" | "black";

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
  | "error"; // something failed; errorMessage/errorHint explain what + what to do, errorRecovery how

// The 7 distinct failure categories this product can actually produce.
// Each maps to a specific cause, not a generic catch-all — see
// RECOVERY_BY_CODE and the throw sites in lib/image + lib/engine for exactly
// which condition raises which code.
export type AppErrorCode =
  | "UNSUPPORTED_FILE"
  | "FILE_TOO_LARGE"
  | "DIMENSIONS_TOO_LARGE"
  | "CORRUPTED_FILE"
  | "BROWSER_UNSUPPORTED"
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
  BROWSER_UNSUPPORTED: "chooseNew",
  VECTORIZE_FAILED: "retry",
  UNKNOWN: "chooseNew",
};

export class AppError extends Error {
  code: AppErrorCode;
  recovery: ErrorRecovery;
  /** The actionable next step, shown as a second line — e.g. "Try a smaller image." */
  hint: string;
  constructor(code: AppErrorCode, message: string, hint: string) {
    super(message);
    this.code = code;
    this.recovery = RECOVERY_BY_CODE[code];
    this.hint = hint;
    this.name = "AppError";
  }
}

// Thrown (never surfaced as an "error" state) when the user cancels an
// in-progress conversion. Distinct from AppError on purpose: cancelling
// isn't a failure, so useConverter catches this separately and returns to
// "ready" instead of "error".
export class ConversionCancelled extends Error {
  constructor() {
    super("Conversion cancelled");
    this.name = "ConversionCancelled";
  }
}
