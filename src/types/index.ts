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
export type Level = "low" | "medium" | "high";

export interface ConversionOptions {
  colorMode: ColorMode;
  // Advanced/optional — only meaningful (and only shown) when colorMode is "color".
  numberOfColors: number; // 2-64
  // Which shapes get kept: low = only large/major shapes, high = keep small detail too.
  detail: Level;
  // How tightly traced curves follow the pixel boundary: low = precise/jagged,
  // high = loose/simplified. Verified independent of `detail` — same shapes,
  // fewer curve control points as smoothness increases.
  smoothness: Level;
}

// numberOfColors default is 20, not a round 16, for a specific engine reason:
// imagetracerjs's default palette seeding (colorsampling: 2) samples colors
// from a sqrt(n)-by-sqrt(n) spatial grid over the image, not from its actual
// color distribution. 16 produces an exact 4x4 grid; on artwork with several
// small/thin same-size color regions (e.g. a multi-petal flower, dense thin
// line art), that grid systematically lands most of its 16 sample points on
// the dominant background and misses distinct smaller regions entirely — they
// get absorbed into the nearest sampled color instead of getting their own
// palette slot, which reads as "colors merging into each other." 20 forces a
// 5x4 grid: finer sampling, verified (scripts/_tmp-numcolors-sweep*.mjs, see
// docs/vectorization-evaluation.md Phase 2) to fix that merging on affected
// fixtures (pixel-error dropped ~65-99% on the two affected test images)
// while being neutral-to-positive on logos/flat art that weren't affected.
export const DEFAULT_OPTIONS: ConversionOptions = {
  colorMode: "color",
  numberOfColors: 20,
  detail: "medium",
  smoothness: "medium",
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
