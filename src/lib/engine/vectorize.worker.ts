/// <reference lib="webworker" />
import ImageTracer from "imagetracerjs";
import { optimizeSvg, rescaleTrace, type OptimizeInput } from "./optimizeSvg";
import { prepareMonochrome, refineLabels, smoothMonochrome, snapLabels, upscaleBilinear, type PaletteColor } from "./analysis";
import type { ImageTracerOptions } from "./presets";

export interface VectorizeRequest {
  imageData: { width: number; height: number; data: Uint8ClampedArray };
  options: ImageTracerOptions;
  // Flat art: snap pixels to these exact fills before tracing (computed on
  // the main thread from sampled pixels; the per-pixel loop runs here so it
  // stays off the UI thread).
  palette?: PaletteColor[] | null;
  snapTolerance?: number;
  smoothing?: number;
  // Monochrome preset: threshold to an ink/background bitmap first.
  mono?: boolean;
  // Trace at this multiple of the source size, then scale the trace back
  // (see analysis.refineLabels). Default 1.
  supersample?: number;
  // When present, the trace is cleaned here (off the UI thread) before it is
  // returned; when absent the raw tracer output is returned untouched.
  cleanup?: OptimizeInput;
}

export interface VectorizeSuccess {
  ok: true;
  svg: string;
  elapsedMs: number;
}

export interface VectorizeFailure {
  ok: false;
  error: string;
}

self.onmessage = (event: MessageEvent<VectorizeRequest>) => {
  const { imageData, options, palette, snapTolerance, smoothing, mono, supersample, cleanup } = event.data;
  const t0 = performance.now();
  try {
    const { width, height, data } = imageData;
    const flat = palette && palette.length > 0;
    // Supersampling only refines snapped/thresholded traces (see analysis.refineLabels).
    const factor = mono || flat ? (supersample ?? 1) : 1;
    const pixels = mono
      ? smoothMonochrome(
          prepareMonochrome(upscaleBilinear(data, width, height, factor), width * factor, height * factor),
          width * factor,
          height * factor,
          factor - 1
        )
      : flat
        ? refineLabels(data, width, height, snapLabels(data, palette, width, height, snapTolerance ?? 32, smoothing ?? 0), palette, factor)
        : data;
    const traced = rescaleTrace(ImageTracer.imagedataToSVG({ width: width * factor, height: height * factor, data: pixels }, options), factor);
    const svg = cleanup ? optimizeSvg(traced, cleanup) : traced;
    const elapsedMs = performance.now() - t0;
    const response: VectorizeSuccess = { ok: true, svg, elapsedMs };
    (self as unknown as Worker).postMessage(response);
  } catch (err) {
    const response: VectorizeFailure = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(response);
  }
};
