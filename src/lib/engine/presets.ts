import type { ConversionOptions } from "../../types";

// imagetracerjs option shape (subset used here). Untyped upstream, so we
// declare the fields we rely on rather than pulling in a loose `any` type.
export interface ImageTracerOptions {
  [key: string]: unknown;
  numberofcolors: number;
  colorquantcycles: number;
  ltres: number;
  qtres: number;
  pathomit: number;
  blurradius: number;
  blurdelta: number;
  roundcoords: number;
  rightangleenhance: boolean;
  strokewidth: number;
}

const DETAIL_PRESETS: Record<ConversionOptions["detail"], { ltres: number; qtres: number; pathomit: number }> = {
  low: { ltres: 4, qtres: 4, pathomit: 30 },
  medium: { ltres: 1, qtres: 1, pathomit: 8 },
  high: { ltres: 0.3, qtres: 0.3, pathomit: 1 },
};

export function buildImageTracerOptions(options: ConversionOptions): ImageTracerOptions {
  const base = DETAIL_PRESETS[options.detail];
  // smoothing (0-1): blurs the source slightly and rounds coordinates more
  // aggressively, which yields simpler, smoother traced curves.
  const blurradius = Math.round(options.smoothing * 5); // 0-5
  const roundcoords = Math.max(0, Math.round(3 - options.smoothing * 2)); // 3 -> 1 decimal places

  return {
    numberofcolors: options.colorMode === "bw" ? 2 : options.numberOfColors,
    colorquantcycles: 3,
    ltres: base.ltres,
    qtres: base.qtres,
    pathomit: base.pathomit,
    blurradius,
    blurdelta: 20,
    roundcoords,
    rightangleenhance: true,
    strokewidth: 0,
  };
}
