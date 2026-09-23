import { AppError, ConversionCancelled, type ConversionOptions, type ConversionResult, type DecodedImage } from "../../types";
import { optimizeSvg, type CleanupConfig } from "./optimizeSvg";
import { getPreset, planTrace, type PresetConfig, type TracePlan } from "./presets";
import type { VectorizeFailure, VectorizeRequest, VectorizeSuccess } from "./vectorize.worker";

const WORKER_TIMEOUT_MS = 30_000;

export interface RawTrace {
  // The tracer's output: untouched when no `cleanup` was requested, otherwise
  // already cleaned (the cleanup runs in the worker).
  svg: string;
  elapsedMs: number;
  plan: TracePlan;
}

// imagetracerjs's imagedataToSVG is a single synchronous call with no
// internal yield points — it cannot pause or report partial progress. The
// only safe, reliable way to cancel is to discard the whole worker: each
// conversion gets its own fresh Worker instance (see below), so terminating
// it mid-run can't corrupt shared state or leave anything half-applied.
export function traceRaw(
  decoded: DecodedImage,
  config: PresetConfig,
  colorCount: number | null,
  signal?: AbortSignal,
  clean?: { cleanup: CleanupConfig }
): Promise<RawTrace> {
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
          "Try a smaller image, or choose the Clean preset."
        )
      );
    }, WORKER_TIMEOUT_MS);

    const onAbort = () => {
      cleanup();
      reject(new ConversionCancelled());
    };
    signal?.addEventListener("abort", onAbort);

    const plan = planTrace(config, colorCount, decoded.imageData.data);

    worker.onmessage = (event: MessageEvent<VectorizeSuccess | VectorizeFailure>) => {
      cleanup();
      const msg = event.data;
      if (msg.ok) {
        resolve({ svg: msg.svg, elapsedMs: msg.elapsedMs, plan });
      } else {
        reject(new AppError("VECTORIZE_FAILED", "We couldn't convert this image.", "Try again, or choose a different image."));
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

    const request: VectorizeRequest = {
      imageData: {
        width: decoded.imageData.width,
        height: decoded.imageData.height,
        data: decoded.imageData.data,
      },
      options: plan.tracer,
      cleanup: clean ? { cleanup: clean.cleanup, hasTransparency: decoded.hasTransparency, flat: plan.palette !== null } : undefined,
      palette: plan.palette,
      snapTolerance: plan.snapTolerance,
      smoothing: plan.smoothing,
      mono: plan.mono,
    };
    worker.postMessage(request);
  });
}

// Runs the configured cleanup over a raw trace. Exposed separately so the
// evaluation harness can compare raw vs cleaned renderings.
export function finalizeSvg(
  rawSvg: string,
  decoded: DecodedImage,
  config: PresetConfig,
  flat: boolean,
  cleanup: CleanupConfig = config.cleanup
): string {
  return optimizeSvg(rawSvg, { cleanup, hasTransparency: decoded.hasTransparency, flat });
}

export async function vectorize(
  decoded: DecodedImage,
  options: ConversionOptions,
  signal?: AbortSignal
): Promise<ConversionResult> {
  const config = getPreset(options.preset);
  const { svg, elapsedMs } = await traceRaw(decoded, config, options.colorCount, signal, { cleanup: config.cleanup });
  return {
    svg,
    sizeBytes: new Blob([svg]).size,
    pathCount: (svg.match(/<path[\s/>]/g) ?? []).length,
    elapsedMs,
  };
}
