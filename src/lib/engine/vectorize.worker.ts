/// <reference lib="webworker" />
import ImageTracer from "imagetracerjs";
import { optimizeSvg, rescaleTrace, type CleanupConfig } from "./optimizeSvg";
import { MONOCHROME_PALETTE, prepareMonochrome, refineLabels, snapLabels } from "./analysis";
import { planTrace, type PresetConfig, type TracePlan } from "./presets";

export interface VectorizeRequest {
  imageData: { width: number; height: number; data: Uint8ClampedArray };
  config: PresetConfig;
  // Explicit color count from the user (overrides the automatic palette).
  colorCount: number | null;
  // The source was lossily compressed (JPEG / WebP).
  lossy: boolean;
  // When present, the trace is cleaned here before it is returned; when
  // absent the raw tracer output is returned untouched.
  cleanup?: { cleanup: CleanupConfig; hasTransparency: boolean };
}

export interface VectorizeSuccess {
  ok: true;
  svg: string;
  elapsedMs: number;
  plan: TracePlan;
}

export interface VectorizeFailure {
  ok: false;
  error: string;
}

// Everything heavy happens here, off the UI thread: planning (palette
// analysis reads every pixel), snapping, tracing, cleanup.
self.onmessage = (event: MessageEvent<VectorizeRequest>) => {
  const { imageData, config, colorCount, lossy, cleanup } = event.data;
  const t0 = performance.now();
  try {
    const { width, height, data } = imageData;
    const plan = planTrace(config, colorCount, imageData, lossy);
    const { palette, mono } = plan;
    // Supersampling only applies to snapped/thresholded traces (see
    // analysis.refineLabels).
    const shaped = mono || palette !== null;
    const factor = shaped ? plan.supersample : 1;
    const monochrome = mono ? prepareMonochrome(data, width, height) : null;
    const pixels = monochrome
      ? refineLabels(monochrome.levels, width, height, monochrome.labels, MONOCHROME_PALETTE, factor)
      : palette
        ? refineLabels(data, width, height, snapLabels(data, palette, width, height, plan.snapTolerance, plan.smoothing, plan.blends), palette, factor)
        : data;
    const traced = rescaleTrace(ImageTracer.imagedataToSVG({ width: width * factor, height: height * factor, data: pixels }, plan.tracer), factor);
    const svg = cleanup ? optimizeSvg(traced, { ...cleanup, flat: palette !== null }) : traced;
    const elapsedMs = performance.now() - t0;
    const response: VectorizeSuccess = { ok: true, svg, elapsedMs, plan };
    (self as unknown as Worker).postMessage(response);
  } catch (err) {
    const response: VectorizeFailure = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(response);
  }
};
