import { AppError, type ConversionOptions, type ConversionResult, type DecodedImage } from "../../types";
import { buildImageTracerOptions } from "./presets";
import type { VectorizeFailure, VectorizeRequest, VectorizeSuccess } from "./vectorize.worker";

const WORKER_TIMEOUT_MS = 30_000;

export function vectorize(
  decoded: DecodedImage,
  options: ConversionOptions
): Promise<ConversionResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./vectorize.worker.ts", import.meta.url), {
      type: "module",
    });

    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new AppError("VECTORIZE_FAILED", "Conversion timed out. Try a smaller image or lower detail."));
    }, WORKER_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<VectorizeSuccess | VectorizeFailure>) => {
      clearTimeout(timeout);
      worker.terminate();
      const msg = event.data;
      if (msg.ok) {
        const svg = msg.svg;
        resolve({
          svg,
          sizeBytes: new Blob([svg]).size,
          pathCount: (svg.match(/<path /g) ?? []).length,
          elapsedMs: msg.elapsedMs,
        });
      } else {
        reject(new AppError("VECTORIZE_FAILED", "The conversion engine failed on this image."));
      }
    };

    worker.onerror = () => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new AppError("VECTORIZE_FAILED", "The conversion engine crashed on this image."));
    };

    const request: VectorizeRequest = {
      imageData: {
        width: decoded.imageData.width,
        height: decoded.imageData.height,
        data: decoded.imageData.data,
      },
      options: buildImageTracerOptions(options),
    };
    worker.postMessage(request);
  });
}
