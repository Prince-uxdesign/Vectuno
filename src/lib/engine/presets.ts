import type { PresetId } from "../../types";
import { buildPalette, type PaletteColor, type PaletteSpec } from "./analysis";
import type { CleanupConfig } from "./optimizeSvg";

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
  pal?: { r: number; g: number; b: number; a: number }[];
}

// What a preset actually changes in the engine. Nothing here is shown to the
// user — the UI only sees `label` and `description`.
export interface PresetConfig {
  id: PresetId;
  label: string;
  // One line, designer language.
  description: string;
  tracer: {
    // Smallest region (in pixels of outline) the tracer keeps.
    pathomit: number;
    // Curve-fitting tolerance: higher = fewer, smoother segments.
    ltres: number;
    qtres: number;
    // Palette refinement passes.
    colorquantcycles: number;
    // Decimal places kept in coordinates.
    roundcoords: number;
  };
  // How the image's real fills are found (see analysis.buildPalette).
  palette: PaletteSpec;
  // If the palette accounts for at least this share of the image it is "flat
  // art": pixels are snapped to the palette before tracing (clean edges, exact
  // colors). Gradients and photographs fall below it and are traced from the
  // original pixels with `palette.maxColors` colors instead.
  flatCoverage: number;
  // Trace a thresholded ink/background bitmap instead of a color palette.
  monochrome: boolean;
  cleanup: CleanupConfig;
}

export const NO_CLEANUP: CleanupConfig = {
  speckle: null,
  stackShapes: false,
  compactColors: false,
  monochrome: false,
};

export const PRESETS: Record<PresetId, PresetConfig> = {
  clean: {
    id: "clean",
    label: "Clean",
    description: "Best for logos and simple graphics.",
    tracer: { pathomit: 20, ltres: 1.5, qtres: 1.5, colorquantcycles: 5, roundcoords: 1 },
    palette: { maxColors: 8, minShare: 0.005, mergeDistance: 40, snapTolerance: 28, smoothing: 1 },
    flatCoverage: 0.88,
    monochrome: false,
    cleanup: {
      speckle: { fraction: 0.008, min: 6, max: 12 },
      stackShapes: true,
      compactColors: true,
      monochrome: false,
    },
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    description: "Great for most images.",
    tracer: { pathomit: 8, ltres: 0.6, qtres: 0.6, colorquantcycles: 5, roundcoords: 1 },
    palette: { maxColors: 20, minShare: 0.003, mergeDistance: 28, snapTolerance: 36, smoothing: 0 },
    flatCoverage: 0.9,
    monochrome: false,
    cleanup: {
      speckle: { fraction: 0.005, min: 4, max: 8 },
      stackShapes: true,
      compactColors: true,
      monochrome: false,
    },
  },
  detailed: {
    id: "detailed",
    label: "Detailed",
    description: "Preserve more visual detail.",
    tracer: { pathomit: 10, ltres: 0.3, qtres: 0.3, colorquantcycles: 5, roundcoords: 1 },
    palette: { maxColors: 32, minShare: 0.002, mergeDistance: 24, snapTolerance: 36, smoothing: 0 },
    flatCoverage: 0.92,
    monochrome: false,
    cleanup: {
      speckle: { fraction: 0.005, min: 4, max: 7 },
      stackShapes: true,
      compactColors: true,
      monochrome: false,
    },
  },
  monochrome: {
    id: "monochrome",
    label: "Monochrome",
    description: "Create a single-color vector.",
    tracer: { pathomit: 4, ltres: 0.5, qtres: 0.5, colorquantcycles: 1, roundcoords: 1 },
    palette: { maxColors: 2, minShare: 0, mergeDistance: 0, snapTolerance: 0, smoothing: 0 },
    flatCoverage: 1,
    monochrome: true,
    cleanup: {
      speckle: null,
      stackShapes: false,
      compactColors: true,
      monochrome: true,
    },
  },
};

export const PRESET_ORDER: readonly PresetId[] = ["clean", "balanced", "detailed", "monochrome"];

export function getPreset(id: PresetId): PresetConfig {
  return PRESETS[id];
}

const MIN_COLORS = 2;
const MAX_COLORS = 64;

export function clampColors(n: number): number {
  return Math.min(MAX_COLORS, Math.max(MIN_COLORS, Math.round(n)));
}

export interface TracePlan {
  tracer: ImageTracerOptions;
  // Flat art: the exact fills to snap pixels to before tracing.
  palette: PaletteColor[] | null;
  snapTolerance: number;
  smoothing: number;
  // Threshold to an ink/background bitmap before tracing.
  mono: boolean;
}

// Turns a preset + the actual image into concrete engine settings. Explicit
// user color counts always win over the automatic palette.
export function planTrace(config: PresetConfig, colorCount: number | null, data: Uint8ClampedArray): TracePlan {
  const base = {
    pathomit: config.tracer.pathomit,
    ltres: config.tracer.ltres,
    qtres: config.tracer.qtres,
    colorquantcycles: config.tracer.colorquantcycles,
    roundcoords: config.tracer.roundcoords,
    blurradius: 0,
    blurdelta: 20,
    rightangleenhance: true,
    strokewidth: 0,
  } as const;

  if (config.monochrome) {
    return {
      tracer: {
        ...base,
        numberofcolors: 2,
        pal: [
          { r: 0, g: 0, b: 0, a: 255 },
          { r: 255, g: 255, b: 255, a: 255 },
        ],
      },
      palette: null,
      snapTolerance: 0,
      smoothing: 0,
      mono: true,
    };
  }

  if (colorCount !== null) {
    return { tracer: { ...base, numberofcolors: clampColors(colorCount) }, palette: null, snapTolerance: 0, smoothing: 0, mono: false };
  }

  const found = buildPalette(data, config.palette);
  if (found && found.palette.length >= 1 && found.coverage >= config.flatCoverage) {
    return {
      // One refinement pass: with pixels already snapped to the palette the
      // fills are exact, so more passes could only drift them.
      tracer: { ...base, colorquantcycles: 1, numberofcolors: found.palette.length, pal: found.palette },
      palette: found.palette,
      snapTolerance: config.palette.snapTolerance,
      smoothing: config.palette.smoothing,
      mono: false,
    };
  }
  return { tracer: { ...base, numberofcolors: config.palette.maxColors }, palette: null, snapTolerance: 0, smoothing: 0, mono: false };
}
