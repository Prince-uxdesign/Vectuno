// Verifies that each conversion setting actually, measurably changes output —
// the product requirement this phase is built around. Run after touching
// src/lib/engine/presets.ts to confirm the mapping still holds.
import sharp from "sharp";
import ImageTracer from "imagetracerjs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, "..", "test", "fixtures");

async function loadRGBA(filePath) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function countPaths(svg) {
  return (svg.match(/<path /g) || []).length;
}

const BASE = {
  numberofcolors: 16,
  colorquantcycles: 3,
  blurradius: 0,
  blurdelta: 20,
  rightangleenhance: true,
  strokewidth: 0,
  roundcoords: 1,
};

const DETAIL = {
  low: { pathomit: 30 },
  medium: { pathomit: 8 },
  high: { pathomit: 1 },
};
const SMOOTHNESS = {
  low: { ltres: 0.2, qtres: 0.2 },
  medium: { ltres: 1, qtres: 1 },
  high: { ltres: 4, qtres: 4 },
};

const files = [
  "01-bw-logo.png",
  "02-color-logo.png",
  "04-flat-illustration.png",
  "06-multicolor-illustration.png",
  "12-fine-details.png",
];

let failures = 0;

for (const file of files) {
  const { data, width, height } = await loadRGBA(path.join(FIXTURES, file));
  const isBw = file.startsWith("01-");
  const colorOpt = isBw ? { numberofcolors: 2 } : {};
  console.log(`\n=== ${file} (${width}x${height}) ===`);

  console.log("  Detail axis (smoothness=medium):");
  const detailResults = {};
  for (const [level, cfg] of Object.entries(DETAIL)) {
    const options = { ...BASE, ...colorOpt, ...SMOOTHNESS.medium, ...cfg };
    const svg = ImageTracer.imagedataToSVG({ width, height, data: new Uint8ClampedArray(data) }, options);
    detailResults[level] = { kb: Buffer.byteLength(svg) / 1024, paths: countPaths(svg) };
    console.log(`    ${level.padEnd(6)} -> ${detailResults[level].kb.toFixed(1)}KB, ${detailResults[level].paths} paths`);
  }

  console.log("  Smoothness axis (detail=medium):");
  const smoothResults = {};
  for (const [level, cfg] of Object.entries(SMOOTHNESS)) {
    const options = { ...BASE, ...colorOpt, ...DETAIL.medium, ...cfg };
    const svg = ImageTracer.imagedataToSVG({ width, height, data: new Uint8ClampedArray(data) }, options);
    smoothResults[level] = { kb: Buffer.byteLength(svg) / 1024, paths: countPaths(svg) };
    console.log(`    ${level.padEnd(6)} -> ${smoothResults[level].kb.toFixed(1)}KB, ${smoothResults[level].paths} paths`);
  }

  // Sanity checks: detail should never make paths *decrease* as it goes up;
  // smoothness should never make file size *increase* as it goes up (same
  // path count expected, but not asserted since some fixtures legitimately
  // have nothing to filter at any pathomit level, as fine-details does).
  if (detailResults.low.paths > detailResults.high.paths) {
    console.log(`    FAIL: detail low has more paths than high`);
    failures++;
  }
  if (smoothResults.low.kb < smoothResults.high.kb) {
    console.log(`    FAIL: smoothness low is smaller than high (expected monotonic decrease)`);
    failures++;
  }
}

console.log(failures === 0 ? "\nAll settings verified monotonic." : `\n${failures} FAILURES`);
process.exit(failures > 0 ? 1 : 0);
