/// <reference lib="webworker" />
import ImageTracer from "imagetracerjs";
import type { ImageTracerOptions } from "./presets";

export interface VectorizeRequest {
  imageData: { width: number; height: number; data: Uint8ClampedArray };
  options: ImageTracerOptions;
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
  const { imageData, options } = event.data;
  const t0 = performance.now();
  try {
    const svg = ImageTracer.imagedataToSVG(
      { width: imageData.width, height: imageData.height, data: imageData.data },
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
