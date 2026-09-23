/// <reference lib="webworker" />
import ImageTracer from "imagetracerjs";
import { optimizeSvg, type OptimizeInput } from "./optimizeSvg";
import { prepareMonochrome, snapToPalette, type PaletteColor } from "./analysis";
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
  const { imageData, options, palette, snapTolerance, smoothing, mono, cleanup } = event.data;
  const t0 = performance.now();
  try {
    const pixels = mono
      ? prepareMonochrome(imageData.data, imageData.width, imageData.height)
      : palette && palette.length > 0
        ? snapToPalette(imageData.data, palette, imageData.width, imageData.height, snapTolerance ?? 32, smoothing ?? 0)
        : imageData.data;
    const traced = ImageTracer.imagedataToSVG(
      { width: imageData.width, height: imageData.height, data: pixels },
      options
    );
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
