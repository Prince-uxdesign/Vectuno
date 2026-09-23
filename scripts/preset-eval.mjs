// Evaluates conversion presets and SVG cleanup against real images, using the
// app's actual pipeline (decode -> Web Worker trace -> cleanup) in Chromium and
// Chrome's own SVG renderer for the comparisons.
//
//   npx vite --port 5185
//   node scripts/preset-eval.mjs matrix                # every image x every preset
//   node scripts/preset-eval.mjs ablate [preset]       # turn each cleanup op off, one at a time
//   node scripts/preset-eval.mjs hygiene              # lossless steps must render pixel-identically
//   node scripts/preset-eval.mjs baseline             # vs the previous engine (needs a copy, see below)
//   node scripts/preset-eval.mjs matrix --only 01,17   # subset (filename prefixes)
//   node scripts/preset-eval.mjs matrix --override '{"clean":{"tracer":{"ltres":1}}}'
//
// Env: BASE_URL (default http://localhost:5185), OUT_DIR (writes triptych PNGs + SVGs).
import { chromium } from "playwright";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.BASE_URL ?? "http://localhost:5185";
const OUT_DIR = process.env.OUT_DIR ?? null;
const FIXTURES = path.resolve("test/fixtures");
const SHOWCASE = path.resolve("public/showcase");

const args = process.argv.slice(2);
const mode = args[0] ?? "matrix";
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const only = flag("only")?.split(",") ?? null;
const overrides = flag("override") ? JSON.parse(flag("override")) : {};

const MIME = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

function dataset() {
  const skip = new Set(["11-large.png", "14-corrupted.png", "15-oversized-dims.png"]);
  const files = readdirSync(FIXTURES)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f) && !skip.has(f))
    .map((f) => ({ name: f, file: path.join(FIXTURES, f) }));
  for (const f of readdirSync(SHOWCASE)) {
    if (/^showcase-0\d\.webp$/.test(f)) files.push({ name: f, file: path.join(SHOWCASE, f) });
  }
  return files
    .filter((f) => !only || only.some((o) => f.name.startsWith(o)))
    .map((f) => ({ ...f, type: MIME[f.name.split(".").pop().toLowerCase().replace("jpeg", "jpg")], bytes: readFileSync(f.file) }));
}

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
page.on("pageerror", (e) => console.error("PAGE ERROR", e.message));
await page.goto(BASE, { waitUntil: "networkidle" });

// Everything below runs in the page against the real app modules.
await page.evaluate(() => {
  window.__eval = async ({ b64, name, type, presetId, overrides, cleanupOff, colorCount, wantImages }) => {
    const [{ decodeImage }, client, presets, analysis] = await Promise.all([
      import("/src/lib/image/decode.ts"),
      import("/src/lib/engine/vectorizeClient.ts"),
      import("/src/lib/engine/presets.ts"),
      import("/src/lib/engine/analysis.ts"),
    ]);
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const decoded = await decodeImage(new File([arr], name, { type }));
    const W = decoded.processedWidth;
    const H = decoded.processedHeight;

    const merge = (a, b) => {
      const out = { ...a };
      for (const k of Object.keys(b ?? {})) out[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) ? merge(a[k] ?? {}, b[k]) : b[k];
      return out;
    };
    const config = merge(presets.PRESETS[presetId], overrides?.[presetId] ?? {});
    let cleanup = { ...config.cleanup };
    for (const k of cleanupOff ?? []) {
      if (k === "speckle") cleanup.speckle = null;
      else cleanup[k] = false;
    }

    const t0 = performance.now();
    const raw = await client.traceRaw(decoded, config, colorCount ?? null);
    const traceMs = performance.now() - t0;
    const t1 = performance.now();
    const flat = raw.plan.palette !== null;
    const cleaned = client.finalizeSvg(raw.svg, decoded, config, flat, cleanup);
    const cleanMs = performance.now() - t1;
    // "raw" for comparison = the tracer's output with only lossless hygiene
    // (viewBox, metadata, dead strokes, exact hex colors) — no fidelity passes.
    const bare = client.finalizeSvg(raw.svg, decoded, config, flat, { ...presets.NO_CLEANUP, monochrome: config.cleanup.monochrome, compactColors: true });

    const render = (svg, scale, bg) =>
      new Promise((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(W * scale));
          c.height = Math.max(1, Math.round(H * scale));
          const ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          resolve(c);
        };
        img.onerror = () => reject(new Error("svg failed to render"));
        img.src = url;
      });
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = W;
    srcCanvas.height = H;
    // Monochrome is judged against the thresholded ink/background bitmap it
    // is meant to reproduce, not against the colour original.
    const isMono = presetId === "monochrome";
    const refData = isMono
      ? new ImageData(analysis.prepareMonochrome(decoded.imageData.data, W, H), W, H)
      : decoded.imageData;
    srcCanvas.getContext("2d").putImageData(refData, 0, 0);
    const reference = (scale, bg) => {
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(W * scale));
      c.height = Math.max(1, Math.round(H * scale));
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(srcCanvas, 0, 0, c.width, c.height);
      return c;
    };
    const diff = (ca, cb) => {
      const a = ca.getContext("2d").getImageData(0, 0, ca.width, ca.height).data;
      const b = cb.getContext("2d").getImageData(0, 0, cb.width, cb.height).data;
      let sum = 0;
      let bad = 0;
      const n = a.length / 4;
      for (let i = 0; i < a.length; i += 4) {
        const dr = Math.abs(a[i] - b[i]);
        const dg = Math.abs(a[i + 1] - b[i + 1]);
        const db = Math.abs(a[i + 2] - b[i + 2]);
        sum += (dr + dg + db) / 3;
        if (Math.max(dr, dg, db) > 40) bad++;
      }
      return { mae: sum / n, bad: (bad / n) * 100 };
    };

    // Transparent sources are judged over both white and black so alpha
    // mistakes can't hide on either.
    const bgs = decoded.hasTransparency && !isMono ? ["#ffffff", "#000000"] : ["#ffffff"];
    const avg = (list, key) => list.reduce((s, x) => s + x[key], 0) / list.length;
    const measure = async (svg, scale) => {
      const rs = [];
      for (const bg of bgs) rs.push(diff(reference(scale, bg), await render(svg, scale, bg)));
      return { mae: avg(rs, "mae"), bad: avg(rs, "bad") };
    };
    const vsRaw = async (scale) => {
      const rs = [];
      for (const bg of bgs) rs.push(diff(await render(bare, scale, bg), await render(cleaned, scale, bg)));
      return { mae: avg(rs, "mae"), bad: avg(rs, "bad") };
    };

    const hygieneDelta = async () => {
      const rs = [];
      for (const bg of bgs) rs.push(diff(await render(raw.svg, 1, bg), await render(bare, 1, bg)));
      return { mae: avg(rs, "mae"), bad: avg(rs, "bad"), rawBytes: new Blob([raw.svg]).size, bareBytes: new Blob([bare]).size };
    };
    const stats = (svg) => {
      const ds = [...svg.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)].map((m) => m[1]);
      const nodes = ds.reduce((s, d) => s + (d.match(/[MLQCZ]/g) ?? []).length, 0);
      const fills = new Set([...svg.matchAll(/fill="([^"]*)"/g)].map((m) => m[1]));
      const longest = Math.max(W, H);
      let tiny = 0;
      for (const d of ds) {
        const nums = d.match(/-?\d+(?:\.\d+)?/g) ?? [];
        let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
        for (let i = 0; i + 1 < nums.length; i += 2) {
          const x = +nums[i], y = +nums[i + 1];
          mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y);
        }
        if (Math.max(mxx - mnx, mxy - mny) < longest * 0.01) tiny++;
      }
      return { bytes: new Blob([svg]).size, paths: ds.length, nodes, colors: fills.size, tiny };
    };

    // The shipped path (cleanup inside the worker) must produce exactly the
    // SVG the harness measured (cleanup on the main thread).
    let appMatches = null;
    if (!cleanupOff?.length && !Object.keys(overrides ?? {}).length) {
      const viaApp = await client.vectorize(decoded, { preset: presetId, colorCount: colorCount ?? null });
      appMatches = viaApp.svg === cleaned;
    }
    const out = {
      appMatches,
      name, presetId, W, H,
      trace: { ms: Math.round(traceMs), colors: raw.plan.tracer.numberofcolors, flat: !!raw.plan.palette },
      cleanMs: +cleanMs.toFixed(1),
      cleaned: { ...stats(cleaned), ...(await measure(cleaned, 1)), half: await measure(cleaned, 0.5) },
      bare: { ...stats(bare), ...(await measure(bare, 1)), half: await measure(bare, 0.5) },
      cleanupDelta: await vsRaw(1),
      cleanupDeltaHalf: await vsRaw(0.5),
      cleanupDeltaZoom: await vsRaw(2),
      hygiene: isMono ? null : await hygieneDelta(),
    };
    if (wantImages) {
      const sheet = document.createElement("canvas");
      sheet.width = W * 3;
      sheet.height = H;
      const sctx = sheet.getContext("2d");
      sctx.fillStyle = "#ffffff";
      sctx.fillRect(0, 0, W * 3, H);
      sctx.drawImage(reference(1, "#ffffff"), 0, 0);
      sctx.drawImage(await render(bare, 1, "#ffffff"), W, 0);
      sctx.drawImage(await render(cleaned, 1, "#ffffff"), W * 2, 0);
      out.sheet = sheet.toDataURL("image/png");
      out.svg = cleaned;
    }
    return out;
  };
});

async function run(img, presetId, extra = {}) {
  return page.evaluate((a) => window.__eval(a), {
    b64: img.bytes.toString("base64"),
    name: img.name,
    type: img.type,
    presetId,
    overrides,
    ...extra,
  });
}

const fmt = (n, d = 2) => (typeof n === "number" ? n.toFixed(d) : String(n));
const kb = (b) => `${(b / 1024).toFixed(1)}K`;
const pad = (s, n) => String(s).padEnd(n);

const images = dataset();
const PRESET_IDS = ["clean", "balanced", "detailed", "monochrome"];

if (mode === "matrix") {
  if (OUT_DIR) mkdirSync(OUT_DIR, { recursive: true });
  console.log(
    `${pad("image", 26)}${pad("preset", 11)}${pad("colors", 7)}${pad("paths", 7)}${pad("nodes", 8)}${pad("tiny", 6)}${pad("size", 9)}${pad("MAE", 7)}${pad("bad%", 7)}${pad("bad%@½", 8)}${pad("trace ms", 9)}${pad("clean ms", 9)}cleanupΔ(MAE/bad%)`
  );
  for (const img of images) {
    for (const presetId of PRESET_IDS) {
      const r = await run(img, presetId, { wantImages: !!OUT_DIR });
      const c = r.cleaned;
      if (r.appMatches === false) console.log("  !! app output differs from measured output");
      console.log(
        `${pad(r.name, 26)}${pad(presetId, 11)}${pad(c.colors, 7)}${pad(c.paths, 7)}${pad(c.nodes, 8)}${pad(c.tiny, 6)}${pad(kb(c.bytes), 9)}${pad(fmt(c.mae), 7)}${pad(fmt(c.bad), 7)}${pad(fmt(c.half.bad), 8)}${pad(r.trace.ms, 9)}${pad(r.cleanMs, 9)}${fmt(r.cleanupDelta.mae, 3)}/${fmt(r.cleanupDelta.bad, 3)}`
      );
      if (OUT_DIR && r.sheet) {
        const base = `${r.name.replace(/\.[a-z]+$/, "")}__${presetId}`;
        writeFileSync(path.join(OUT_DIR, `${base}.png`), Buffer.from(r.sheet.split(",")[1], "base64"));
        writeFileSync(path.join(OUT_DIR, `${base}.svg`), r.svg);
      }
    }
  }
} else if (mode === "baseline") {
  // Compares the previous shipped engine (default options: Detail High,
  // Smoothness Low, 20 colours) with the new presets on the same images.
  // Needs a copy of the old engine at src/lib/engine_legacy: for f in presets optimizeSvg
  // vectorize.worker vectorizeClient; do git show be25dbc:src/lib/engine/$f.ts > ...; done
  await page.evaluate(() => {
    window.__legacy = async ({ b64, name, type }) => {
      const [{ decodeImage }, legacy] = await Promise.all([
        import("/src/lib/image/decode.ts"),
        import("/src/lib/engine_legacy/vectorizeClient.ts"),
      ]);
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const decoded = await decodeImage(new File([arr], name, { type }));
      const W = decoded.processedWidth;
      const H = decoded.processedHeight;
      const t0 = performance.now();
      const res = await legacy.vectorize(decoded, { colorMode: "color", numberOfColors: 20, detail: "high", smoothness: "low" });
      const ms = performance.now() - t0;
      const render = (svg, scale, bg) =>
        new Promise((resolve, reject) => {
          const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
          const img = new Image();
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width = Math.max(1, Math.round(W * scale));
            c.height = Math.max(1, Math.round(H * scale));
            const ctx = c.getContext("2d", { willReadFrequently: true });
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(img, 0, 0, c.width, c.height);
            resolve(c);
          };
          img.onerror = reject;
          img.src = url;
        });
      const src = document.createElement("canvas");
      src.width = W;
      src.height = H;
      src.getContext("2d").putImageData(decoded.imageData, 0, 0);
      const ref = (scale, bg) => {
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(W * scale));
        c.height = Math.max(1, Math.round(H * scale));
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(src, 0, 0, c.width, c.height);
        return c;
      };
      const diff = (a, b) => {
        const x = a.getContext("2d").getImageData(0, 0, a.width, a.height).data;
        const y = b.getContext("2d").getImageData(0, 0, b.width, b.height).data;
        let sum = 0, bad = 0;
        const n = x.length / 4;
        for (let i = 0; i < x.length; i += 4) {
          const dr = Math.abs(x[i] - y[i]), dg = Math.abs(x[i + 1] - y[i + 1]), db = Math.abs(x[i + 2] - y[i + 2]);
          sum += (dr + dg + db) / 3;
          if (Math.max(dr, dg, db) > 40) bad++;
        }
        return { mae: sum / n, bad: (bad / n) * 100 };
      };
      const bgs = decoded.hasTransparency ? ["#ffffff", "#000000"] : ["#ffffff"];
      const m = async (scale) => {
        const rs = [];
        for (const bg of bgs) rs.push(diff(ref(scale, bg), await render(res.svg, scale, bg)));
        return { mae: rs.reduce((a, r) => a + r.mae, 0) / rs.length, bad: rs.reduce((a, r) => a + r.bad, 0) / rs.length };
      };
      const ds = [...res.svg.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)].map((x) => x[1]);
      return { bytes: res.sizeBytes, paths: ds.length, nodes: ds.reduce((t, d) => t + (d.match(/[MLQCZ]/g) ?? []).length, 0), ms: Math.round(ms), ...(await m(1)), half: await m(0.5) };
    };
  });
  const rows = [];
  console.log(`${pad("image", 26)}${pad("engine", 10)}${pad("paths", 7)}${pad("nodes", 8)}${pad("size", 9)}${pad("MAE", 7)}${pad("bad%@1", 8)}${pad("bad%@½", 8)}ms(total)`);
  for (const img of images) {
    const legacy = await page.evaluate((a) => window.__legacy(a), { b64: img.bytes.toString("base64"), name: img.name, type: img.type });
    const row = { name: img.name, legacy };
    console.log(`${pad(img.name, 26)}${pad("previous", 10)}${pad(legacy.paths, 7)}${pad(legacy.nodes, 8)}${pad(kb(legacy.bytes), 9)}${pad(fmt(legacy.mae), 7)}${pad(fmt(legacy.bad), 8)}${pad(fmt(legacy.half.bad), 8)}${legacy.ms}`);
    for (const id of ["clean", "balanced", "detailed"]) {
      const r = await run(img, id);
      row[id] = r;
      const c = r.cleaned;
      console.log(`${pad("", 26)}${pad(id, 10)}${pad(c.paths, 7)}${pad(c.nodes, 8)}${pad(kb(c.bytes), 9)}${pad(fmt(c.mae), 7)}${pad(fmt(c.bad), 8)}${pad(fmt(c.half.bad), 8)}${r.trace.ms + Math.round(r.cleanMs)}`);
    }
    rows.push(row);
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const logos = rows.filter((r) => /^(01|02|16|17|18|19|04|13)/.test(r.name));
  const summary = (label, list) => {
    console.log(`\n${label} (${list.length} images) — mean MAE / mean bad%@½ / mean paths / mean size KB / mean ms`);
    const line = (n, f) => console.log(`  ${pad(n, 10)}${pad(fmt(mean(list.map(f.mae)), 2), 8)}${pad(fmt(mean(list.map(f.bad)), 2), 8)}${pad(fmt(mean(list.map(f.paths)), 0), 8)}${pad(fmt(mean(list.map(f.kb)), 1), 8)}${fmt(mean(list.map(f.ms)), 0)}`);
    line("previous", { mae: (r) => r.legacy.mae, bad: (r) => r.legacy.half.bad, paths: (r) => r.legacy.paths, kb: (r) => r.legacy.bytes / 1024, ms: (r) => r.legacy.ms });
    for (const id of ["clean", "balanced", "detailed"])
      line(id, { mae: (r) => r[id].cleaned.mae, bad: (r) => r[id].cleaned.half.bad, paths: (r) => r[id].cleaned.paths, kb: (r) => r[id].cleaned.bytes / 1024, ms: (r) => r[id].trace.ms + r[id].cleanMs });
  };
  summary("Logos / flat brand graphics", logos);
  summary("All images", rows);
} else if (mode === "hygiene") {
  // The always-on lossless steps (viewBox, metadata, zero-opacity paths,
  // opacity rounding, dead strokes, hex colours) must render pixel-identically
  // to the tracer's raw output.
  console.log(`${pad("image", 26)}${pad("raw", 10)}${pad("hygiene-only", 14)}${pad("saved", 8)}render diff vs raw (MAE / pixels changed %)`);
  let worst = 0;
  for (const img of images) {
    const r = await run(img, "balanced");
    const h = r.hygiene;
    worst = Math.max(worst, h.mae);
    console.log(`${pad(img.name, 26)}${pad(kb(h.rawBytes), 10)}${pad(kb(h.bareBytes), 14)}${pad(fmt((1 - h.bareBytes / h.rawBytes) * 100, 0) + "%", 8)}${fmt(h.mae, 4)} / ${fmt(h.bad, 4)}`);
  }
  console.log(`worst MAE ${fmt(worst, 4)}`);
} else if (mode === "ablate") {
  // For each cleanup pass: turn ONLY that pass off and report the change vs
  // "everything on", averaged over the dataset. Positive dMAE = the pass helps.
  const presetId = args[1] && !args[1].startsWith("--") ? args[1] : "balanced";
  const OPS = ["speckle", "stackShapes"];
  const rows = [];
  for (const img of images) {
    const full = await run(img, presetId);
    const row = { name: img.name, full: full.cleaned, bare: full.bare, ops: {} };
    for (const op of OPS) row.ops[op] = (await run(img, presetId, { cleanupOff: [op] })).cleaned;
    rows.push(row);
    console.log(`${pad(img.name, 26)}all-on MAE ${fmt(full.cleaned.mae, 2)} | bare MAE ${fmt(full.bare.mae, 2)} | ` + OPS.map((op) => `${op}:${fmt(row.ops[op].mae - full.cleaned.mae, 2)}`).join(" "));
  }
  console.log(`\nPreset "${presetId}" — effect of each cleanup pass, mean over ${rows.length} images`);
  console.log("(dMAE / dBad@1/2 = value WITHOUT the pass minus value WITH it: positive means the pass improves fidelity; dSize = size WITHOUT / size WITH)");
  console.log(`${pad("pass", 22)}${pad("dMAE", 9)}${pad("dBad@½ (pts)", 14)}${pad("dSize %", 10)}${pad("dPaths %", 10)}worst-case dMAE (image)`);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  for (const op of OPS) {
    const dm = rows.map((r) => r.ops[op].mae - r.full.mae);
    const worst = rows.reduce((w, r) => (r.ops[op].mae - r.full.mae < w.v ? { v: r.ops[op].mae - r.full.mae, n: r.name } : w), { v: Infinity, n: "" });
    console.log(
      `${pad(op, 22)}${pad(fmt(mean(dm), 3), 9)}${pad(fmt(mean(rows.map((r) => r.ops[op].half.bad - r.full.half.bad)), 3), 14)}${pad(fmt(mean(rows.map((r) => (r.ops[op].bytes / r.full.bytes - 1) * 100)), 1), 10)}${pad(fmt(mean(rows.map((r) => (r.ops[op].paths / Math.max(1, r.full.paths) - 1) * 100)), 1), 10)}${fmt(worst.v, 3)} (${worst.n})`
    );
  }
  const dmBare = rows.map((r) => r.bare.mae - r.full.mae);
  console.log(`${pad("(all cleanup vs bare)", 22)}${pad(fmt(mean(dmBare), 3), 9)}${pad(fmt(mean(rows.map((r) => r.bare.half.bad - r.full.half.bad)), 3), 14)}${pad(fmt(mean(rows.map((r) => (r.bare.bytes / r.full.bytes - 1) * 100)), 1), 10)}${fmt(mean(rows.map((r) => (r.bare.paths / Math.max(1, r.full.paths) - 1) * 100)), 1)}`);
}

await browser.close();
