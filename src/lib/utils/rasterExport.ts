// Caps the exported canvas so a large source image can't produce an
// unreasonably huge raster (memory/crash risk) — 2x the original
// resolution is enough for a crisp export without ballooning past this.
const MAX_EXPORT_DIMENSION = 4096;
const EXPORT_SCALE = 2;
const IMAGE_LOAD_TIMEOUT_MS = 10_000;

export type RasterFormat = "png" | "jpeg";

function loadSvgImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      reject(new Error("Timed out loading SVG for raster export"));
    }, IMAGE_LOAD_TIMEOUT_MS);
    image.onload = () => {
      clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Failed to load SVG for raster export"));
    };
    image.src = url;
  });
}

export async function rasterizeSvg(svg: string, width: number, height: number, format: RasterFormat): Promise<Blob> {
  const longestSide = Math.max(width, height, 1);
  const scale = Math.min(EXPORT_SCALE, MAX_EXPORT_DIMENSION / longestSide);
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await loadSvgImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    // JPEG has no alpha channel; flatten onto white so transparent areas
    // don't render black.
    if (format === "jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode raster image"))),
        format === "jpeg" ? "image/jpeg" : "image/png",
        format === "jpeg" ? 0.92 : undefined
      );
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
