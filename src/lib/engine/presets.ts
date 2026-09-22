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

// Verified against representative fixtures via `npm run test:settings`
// (scripts/benchmark-settings.mjs) before shipping — not guessed. `pathomit`
// is imagetracerjs's minimum
// path-size filter: it's the only parameter that changes *which* shapes
// survive, so it's the honest mapping for "Detail". Confirmed monotonic:
// low (30) keeps only major shapes (e.g. 6 paths on a logo), high (1) keeps
// nearly everything (e.g. 686 paths on the same logo).
const DETAIL_PATHOMIT: Record<ConversionOptions["detail"], number> = {
  low: 30,
  medium: 8,
  high: 1,
};

// `ltres`/`qtres` are imagetracerjs's line/quadratic curve-fitting error
// tolerance — literally "curve simplification tolerance" from the product
// brief, which is exactly why this is the "Smoothness" control rather than
// Detail. Verified independent of pathomit: path *count* stays identical
// across low/medium/high on every fixture tested (same shapes kept), while
// output size shrinks monotonically (e.g. 35.5KB -> 20.0KB -> 18.7KB on a
// logo) as curves get simplified into fewer, looser control points.
const SMOOTHNESS_TRES: Record<ConversionOptions["smoothness"], number> = {
  low: 0.2,
  medium: 1,
  high: 4,
};

// blurradius (pre-blurring the source before tracing) was tested as a
// candidate "smoothness" control and rejected: it increases path count and
// file size on flat/illustration art (edge anti-aliasing gets quantized
// into extra color bands), the opposite of what "smoothness" should do. Left
// off entirely rather than exposed as a control that sometimes makes things
// worse. roundcoords (coordinate decimal precision) has no visible effect on
// shape and is fixed rather than exposed, per "don't add a setting that
// can't meaningfully influence output."
const FIXED = {
  blurradius: 0,
  blurdelta: 20,
  roundcoords: 1,
  rightangleenhance: true,
  strokewidth: 0,
  colorquantcycles: 3,
} as const;

export function buildImageTracerOptions(options: ConversionOptions): ImageTracerOptions {
  return {
    numberofcolors: options.colorMode === "bw" ? 2 : options.numberOfColors,
    pathomit: DETAIL_PATHOMIT[options.detail],
    ltres: SMOOTHNESS_TRES[options.smoothness],
    qtres: SMOOTHNESS_TRES[options.smoothness],
    ...FIXED,
  };
}
