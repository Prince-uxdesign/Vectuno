/// <reference lib="webworker" />
import ImageTracer from "imagetracerjs";
import { quantizeToDominant, type ImageTracerOptions } from "./presets";

export interface VectorizeRequest {
  imageData: { width: number; height: number; data: Uint8ClampedArray };
  options: ImageTracerOptions;
  // Deterministic pre-quantization (see presets.quantizeToDominant): collapses
  // JPEG ringing back into dominant fills before tracing. Computed on the
  // main thread from sampled pixels; applied here so the full-resolution
  // snap loop stays off the UI thread.
  quantize?: boolean;
  quantizeK?: number;
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
  const { imageData, options, quantize, quantizeK } = event.data;
  const t0 = performance.now();
  try {
    const pixels =
      quantize && quantizeK ? quantizeToDominant(imageData.data, quantizeK) : imageData.data;
    const svg = ImageTracer.imagedataToSVG(
      { width: imageData.width, height: imageData.height, data: pixels },
      options
    );
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
