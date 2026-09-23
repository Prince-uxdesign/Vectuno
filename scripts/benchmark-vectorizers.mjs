import sharp from "sharp";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import ImageTracer from "imagetracerjs";

// NOTE: vtracer-wasm was evaluated and rejected — see docs/vectorization-evaluation.md.
// It panics (`RuntimeError: unreachable`) on every call, in both Node and real
// Chromium (verified via Playwright), regardless of config shape. Not usable.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FIXTURES = path.join(ROOT, "test/fixtures");
const OUT = path.join(ROOT, "test/output");
mkdirSync(OUT, { recursive: true });

function countPaths(svg) {
  return (svg.match(/<path[\s/>]/g) || []).length;
}

async function loadRGBA(filePath) {
  const img = sharp(filePath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function runImageTracerFromPixels(data, width, height, options) {
  // imagetracerjs expects an ImageData-like {width,height,data}
  const imgd = { width, height, data: new Uint8ClampedArray(data) };
  const t0 = performance.now();
  const svg = ImageTracer.imagedataToSVG(imgd, options);
  const ms = performance.now() - t0;
  return { svg, ms };
}

const IMAGETRACER_DEFAULT = {}; // library defaults

async function main() {
  const files = readdirSync(FIXTURES).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  const results = [];

  for (const file of files) {
    const filePath = path.join(FIXTURES, file);
    const srcStat = (await sharp(filePath).metadata());
    const srcBytes = readFileSync(filePath).length;

    const row = {
      file,
      srcDims: `${srcStat.width}x${srcStat.height}`,
      srcKB: (srcBytes / 1024).toFixed(1),
    };

    // imagetracerjs
    try {
      const { data, width, height } = await loadRGBA(filePath);
      const { svg, ms } = runImageTracerFromPixels(data, width, height, IMAGETRACER_DEFAULT);
      writeFileSync(path.join(OUT, `imagetracer-${file.replace(/\.(jpe?g|png|webp)$/i, "")}.svg`), svg);
      row.imagetracer = {
        ms: ms.toFixed(0),
        kb: (Buffer.byteLength(svg) / 1024).toFixed(1),
        paths: countPaths(svg),
      };
    } catch (e) {
      row.imagetracer = { error: String(e.message || e).slice(0, 200) };
    }

    results.push(row);
    console.log(`${file}: ${JSON.stringify(row.imagetracer)}`);
  }

  writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  console.log("\nDone. Results in test/output/results.json and .svg files.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
