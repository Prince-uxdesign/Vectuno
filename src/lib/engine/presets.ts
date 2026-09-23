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
// survive, so it's the honest mapping for "Detail". Values were raised after
// a fidelity pass on flat cartoon art (black cat on yellow): pathomit 8
// kept hundreds of JPEG-noise / antialiased-edge micro-paths (1253 paths on
// a 1200px flat illustration that should be <20). The new scale still
// separates Low/Medium/High monotonically, but Medium now actually cleans.
const DETAIL_PATHOMIT: Record<ConversionOptions["detail"], number> = {
  low: 40,
  medium: 16,
  high: 4,
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
// colorsampling (palette seeding strategy) and mincolorratio (palette-slot
// reseeding threshold) are deliberately left at imagetracerjs's own defaults
// (2 and 0) rather than exposed or changed, after testing the alternatives:
//   - colorsampling: 1 (samplepalette — random pixel picks) and 0
//     (generatepalette — RGB-cube + random padding) both call Math.random()
//     internally with no seed, so the *same image converted twice* can
//     produce a visibly different SVG. Confirmed via 5 repeated runs each:
//     worst-of-5 pixel error on some fixtures was 3-15x the median. Not acceptable for a tool people expect
//     to be repeatable. colorsampling: 2 (samplepalette2, the default) is a
//     fixed spatial grid — no randomness anywhere in this pipeline.
//   - mincolorratio > 0 (reseed palette slots below a pixel-count threshold)
//     also reseeds via Math.random(), and empirically discarded real minor
//     brand colors on flat art in testing (see DEFAULT_OPTIONS.numberOfColors
//     comment in types/index.ts for the fix that actually addressed the
//     color-merging bug this was tried against).
const FIXED = {
  blurradius: 0,
  blurdelta: 20,
  roundcoords: 1,
  rightangleenhance: true,
  strokewidth: 0,
  // Raised 3 -> 5: more k-means-style refinement passes over the palette, so
  // dominant flat colors land closer to their true values (less dulling)
  // without adding randomness (colorsampling stays deterministic).
  colorquantcycles: 5,
} as const;

// numberOfColors is documented as 2-64 (see ConversionOptions in
// types/index.ts) but nothing upstream enforces that range before it
// reaches imagetracerjs — clamp here so an out-of-range value (e.g. a
// future UI bug or a hand-crafted options object) can't reach the worker.
const MIN_COLORS = 2;
const MAX_COLORS = 64;

// Default slider value — when the user hasn't touched Advanced, we adapt
// down for flat art (see estimatePaletteSize). A fixed 20 keeps JPEG noise
// and antialiased edge bands as separate palette entries on images that
// really only have 4-6 colors, which reads as speckles + dull washed-out
// fills. Fewer palette slots forces those bands to merge into the dominant
// colors, which is exactly what flat illustration needs.
const DEFAULT_COLORS = 20;

function clampColors(n: number): number {
  return Math.min(MAX_COLORS, Math.max(MIN_COLORS, Math.round(n)));
}

// Estimate how many palette slots flat art actually needs, from the decoded
// pixels. Counts coarse 4-bit-per-channel bins by frequency and asks how many
// bins cover 97% of sampled pixels: flat cartoons need 2-4 (a yellow, a black,
// a white…), multicolor illustration ~13, photos hundreds. Coarse bins ignore
// JPEG ringing while still separating real fills (yellow vs black vs white
// vs red are far apart). Sampled stride keeps it cheap on 2000px images.
export function estimatePaletteSize(data: Uint8ClampedArray): number {
  const counts = new Map<number, number>();
  let total = 0;
  const stride = 16;
  for (let i = 0; i < data.length; i += 4 * stride) {
    if (data[i + 3] < 128) continue; // transparent — traced as opacity, not a color
    const key = ((data[i] >> 4) << 12) | ((data[i + 1] >> 4) << 8) | ((data[i + 2] >> 4) << 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total += 1;
  }
  if (total === 0) return DEFAULT_COLORS;
  const sorted = [...counts.values()].sort((a, b) => b - a);
  let covered = 0;
  let need = 0;
  for (const c of sorted) {
    covered += c;
    need += 1;
    if (covered / total >= 0.97) break;
  }
  if (need <= 4) return 8;
  if (need <= 8) return 12;
  if (need <= 16) return 16;
  return DEFAULT_COLORS;
}

export function buildImageTracerOptions(
  options: ConversionOptions,
  imageData?: { data: Uint8ClampedArray }
): ImageTracerOptions {
  let colors =
    options.colorMode === "bw" ? 2 : clampColors(options.numberOfColors);
  // Only adapt when the user hasn't customized Advanced — an explicit
  // choice always wins over the heuristic.
  if (options.colorMode !== "bw" && options.numberOfColors === DEFAULT_COLORS && imageData) {
    colors = Math.min(colors, estimatePaletteSize(imageData.data));
  }
  return {
    numberofcolors: colors,
    pathomit: DETAIL_PATHOMIT[options.detail],
    ltres: SMOOTHNESS_TRES[options.smoothness],
    qtres: SMOOTHNESS_TRES[options.smoothness],
    ...FIXED,
  };
}
