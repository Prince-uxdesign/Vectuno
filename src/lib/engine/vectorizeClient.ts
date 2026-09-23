import { AppError, ConversionCancelled, type ConversionOptions, type ConversionResult, type DecodedImage } from "../../types";
import { buildImageTracerOptions, countDominantBins, DEFAULT_COLORS, quantizationWidth } from "./presets";
import { optimizeSvg } from "./optimizeSvg";
import type { VectorizeFailure, VectorizeRequest, VectorizeSuccess } from "./vectorize.worker";

const WORKER_TIMEOUT_MS = 30_000;

// imagetracerjs's imagedataToSVG is a single synchronous call with no
// internal yield points — it cannot pause or report partial progress. The
// only safe, reliable way to cancel is to discard the whole worker: each
// conversion gets its own fresh Worker instance (see below), so terminating
// it mid-run can't corrupt shared state or leave anything half-applied.
export function vectorize(
  decoded: DecodedImage,
  options: ConversionOptions,
  signal?: AbortSignal
): Promise<ConversionResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ConversionCancelled());
      return;
    }

    const worker = new Worker(new URL("./vectorize.worker.ts", import.meta.url), {
      type: "module",
    });

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new AppError(
          "VECTORIZE_FAILED",
          "This conversion is taking too long.",
          "Try a smaller image, or lower the detail setting."
        )
      );
    }, WORKER_TIMEOUT_MS);

    const onAbort = () => {
      cleanup();
      reject(new ConversionCancelled());
    };
    signal?.addEventListener("abort", onAbort);

    worker.onmessage = (event: MessageEvent<VectorizeSuccess | VectorizeFailure>) => {
      cleanup();
      const msg = event.data;
      if (msg.ok) {
        try {
          const svg = optimizeSvg(msg.svg);
          resolve({
            svg,
            sizeBytes: new Blob([svg]).size,
            pathCount: (svg.match(/<path[\s/>]/g) ?? []).length,
            elapsedMs: msg.elapsedMs,
          });
        } catch {
          reject(
            new AppError(
              "VECTORIZE_FAILED",
              "We couldn't finish preparing this image.",
              "Try again, or choose a different image."
            )
          );
        }
      } else {
        reject(
          new AppError(
            "VECTORIZE_FAILED",
            "We couldn't convert this image.",
            "Try again, or choose a different image."
          )
        );
      }
    };

    worker.onerror = () => {
      cleanup();
      reject(
        new AppError(
          "BROWSER_UNSUPPORTED",
          "Your browser stopped the conversion unexpectedly.",
          "Try a recent version of Chrome, Firefox, Safari, or Edge."
        )
      );
    };

    // Fires if the worker posts something structured-clone can't
    // deserialize back on this side — onmessage never runs in that case, so
    // without this the caller would just sit until the 30s timeout.
    worker.onmessageerror = () => {
      cleanup();
      reject(
        new AppError(
          "BROWSER_UNSUPPORTED",
          "Your browser couldn't read the conversion result.",
          "Try a recent version of Chrome, Firefox, Safari, or Edge."
        )
      );
    };

    // Flat-art pipeline: when the user hasn't customized the Advanced colors
    // slider, collapse JPEG ringing into dominant fills before tracing (see
    // presets.quantizeToDominant). Gated on a small dominant-bin count so
    // photos/gradients (hundreds of bins) take the untouched path with the
    // user's palette size. Explicit slider choices always skip this.
    const isDefaultColors =
      options.colorMode !== "bw" && options.numberOfColors === DEFAULT_COLORS;
    const dominantBins =
      options.colorMode === "bw" ? Number.MAX_SAFE_INTEGER : countDominantBins(decoded.imageData.data);
    const quantize = isDefaultColors && dominantBins <= 18;
    const quantizeK = quantize ? quantizationWidth(decoded.imageData.data) : 0;
    const baseOptions = buildImageTracerOptions(options, decoded.imageData);
    const request: VectorizeRequest = {
      imageData: {
        width: decoded.imageData.width,
        height: decoded.imageData.height,
        data: decoded.imageData.data,
      },
      options: quantize ? { ...baseOptions, numberofcolors: quantizeK } : baseOptions,
      quantize,
      quantizeK,
    };
    worker.postMessage(request);
  });
}
