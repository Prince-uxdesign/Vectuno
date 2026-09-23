// imagetracerjs emits only width/height on the root <svg> — no viewBox. That
// means the file doesn't scale via CSS/container sizing the way a normal
// vector export does, and some editors treat a viewBox-less SVG's canvas
// less predictably. Add one derived from the same width/height so the
// document is a "normal" scalable SVG while the rendered dimensions are
// unchanged (viewBox 0 0 W H over a W x H viewport is 1:1).
function addViewBox(svg: string): string {
  if (/\sviewBox=['"]/.test(svg)) return svg;
  const openTagMatch = /<svg\b[^>]*>/.exec(svg);
  if (!openTagMatch) return svg;
  const openTag = openTagMatch[0];
  const width = /\swidth=['"]([\d.]+)['"]/.exec(openTag)?.[1];
  const height = /\sheight=['"]([\d.]+)['"]/.exec(openTag)?.[1];
  if (!width || !height) return svg;
  return svg.replace(/<svg\b/, `<svg viewBox="0 0 ${width} ${height}"`);
}

// Deterministic speckle strip: imagetracerjs with pathomit still emits
// isolated micro-paths from JPEG ringing / dithered pixels (the "dots all
// over the black" look) plus thin edge-fringe slivers along high-contrast
// boundaries. Two rules, both general (no color-specific logic):
//   1. Drop anything smaller than minSize in BOTH axes (dots).
//   2. Drop thin slivers: bbox area under minSize²/3 while the long side is
//      still under minSize×2 (e.g. 1×16px pink fringe on a 1200px image).
// Real detail survives either rule: eyes/fangs/text are compact but larger
// than minSize, and whiskers/strokes are long in at least one axis with
// real area behind them. Parse each path's coordinate bbox from its d
// attribute. Pure string/regex work — no DOM needed (runs in the worker
// callback as well as tests).
function stripSpeckles(svg: string, minSize: number): string {
  const areaLimit = (minSize * minSize) / 3;
  const longLimit = minSize * 2;
  return svg.replace(/<path\b[^>]*\bd="([^"]*)"[^>]*\/?>/g, (tag, d: string) => {
    const nums = d.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 4) return tag;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = Number(nums[i]);
      const y = Number(nums[i + 1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (!Number.isFinite(minX)) return tag;
    const w = maxX - minX;
    const h = maxY - minY;
    if (w < minSize && h < minSize) return "";
    if (w * h < areaLimit && Math.max(w, h) < longLimit) return "";
    return tag;
  });
}
// Merge near-duplicate fills: JPEG ringing splits what the eye reads as one
// flat color into several palette entries a few units apart (78 lighter-blue
// islands across an otherwise flat sky; 4 near-identical yellows on one
// cartoon). Each island then renders as a visible speck even though its shape
// is "correct". Repaint smaller fills into the nearest larger fill when their
// RGB distance is under FILL_MERGE_DIST — the islands take the background's
// exact color and vanish, with zero shapes deleted. One pass, largest-first,
// so merges always flow toward dominant colors and never chain. Kept at 20
// (not higher) on purpose: near-white details like shoe-lace highlights sit
// ~23 units from neighboring cream/pants-white fills and must survive, while
// JPEG ringing bands sit ~13 units apart and still merge. Distinct hues
// (white eyes vs yellow, red mouth vs orange light, gray ears vs black) sit
// far apart and are never touched — only noise-split near-duplicates
// merge. Only exact `fill="rgb(r,g,b)"` fills participate; anything else
// (gradients/urls/none) passes through.
const FILL_MERGE_DIST = 20;

function mergeDuplicateFills(svg: string, dropSize: number): string {
  const fills = new Map<string, { count: number; area: number; rgb: [number, number, number] }>();
  const tagRe = /<path\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(svg)) !== null) {
    const tag = m[0];
    const f = /fill="rgb\((\d+),(\d+),(\d+)\)"/.exec(tag);
    if (!f) continue;
    const d = /\bd="([^"]*)"/.exec(tag)?.[1] ?? "";
    const nums = d.match(/-?\d+(?:\.\d+)?/g);
    let area = 0;
    if (nums && nums.length >= 4) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const x = Number(nums[i]);
        const y = Number(nums[i + 1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (Number.isFinite(minX)) area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
    }
    const key = `rgb(${f[1]},${f[2]},${f[3]})`;
    const e = fills.get(key);
    if (e) {
      e.count += 1;
      e.area += area;
    } else {
      fills.set(key, { count: 1, area, rgb: [Number(f[1]), Number(f[2]), Number(f[3])] });
    }
  }
  if (fills.size < 2) return svg;
  const ordered = [...fills.entries()].sort((a, b) => b[1].area - a[1].area);
  const repaint = new Map<string, string>();
  for (let i = 0; i < ordered.length; i++) {
    const [key, e] = ordered[i];
    let best: string | null = null;
    let bestDist = Number.MAX_SAFE_INTEGER;
    for (let j = 0; j < i; j++) {
      const [dkey, d] = ordered[j];
      const dist =
        (e.rgb[0] - d.rgb[0]) ** 2 + (e.rgb[1] - d.rgb[1]) ** 2 + (e.rgb[2] - d.rgb[2]) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = dkey;
      }
    }
    if (best !== null && bestDist < FILL_MERGE_DIST * FILL_MERGE_DIST) repaint.set(key, best);
  }
  if (repaint.size === 0) return svg;
  // Single pass over path tags: repaint fills, and drop repainted tags that
  // are truly tiny. A repainted path now renders the target color; when it is
  // also tiny it is a former noise island fully inside (or adjacent to) that
  // same color, so deleting it is visually inert and reclaims the bytes. The
  // cutoff stays at dropSize (== the speckle threshold, a few px) — anything
  // bigger stays as a shape, because near-duplicate does not mean identical:
  // small-but-real details (shoe-lace highlights, stitching) must survive as
  // geometry even when their color is close to a neighbor's. Large repainted
  // regions (e.g. a background split in two halves) always stay as shapes.
  return svg.replace(/<path\b[^>]*>/g, (tag) => {
    const f = /fill="(rgb\(\d+,\d+,\d+\))"/.exec(tag);
    const to = f ? repaint.get(f[1]) : undefined;
    if (to === undefined) return tag;
    const repainted = tag.replace(f![0], `fill="${to}"`);
    const d = /\bd="([^"]*)"/.exec(tag)?.[1] ?? "";
    const nums = d.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 4) return repainted;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = Number(nums[i]);
      const y = Number(nums[i + 1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (!Number.isFinite(minX)) return repainted;
    if (Math.max(maxX - minX, maxY - minY) < dropSize) return "";
    return repainted;
  });
}
// Seal hairline cracks: adjacent traced paths share mathematically exact
// boundaries, but curve fitting (ltres/qtres) plus 1-decimal rounding leaves
// sub-pixel gaps. The white page behind shows through as scattered light
// specks — most visible where dozens of small fragments tile a region
// (illustration shading) and at downscaled display sizes, where a 1px crack
// aliases into bright dots. Painting every path with its own fill color at a
// hairline width (1 output unit ≈ 0.25 screen px at typical display sizes)
// overlaps neighbors instead of gapping. Kept at 1, not wider, on purpose:
// a wider seal bleeds each fill outward, and on fine light-on-dark detail
// (white shoe highlights inside black) the surrounding dark strokes close
// over the light shapes and read as "blacks covering the whites".
// General (no color/shape logic) and helps every image. Only applies to
// `fill="rgb(...)"` paths; structural markup passes through.
const CRACK_SEAL_WIDTH = 1;

function sealCracks(svg: string): string {
  return svg.replace(/<path\b[^>]*>/g, (tag) => {
    const f = /fill="(rgb\(\d+,\d+,\d+\))"/.exec(tag);
    if (!f) return tag;
    // imagetracerjs emits stroke="..." stroke-width="0" (dead weight) — swap
    // it for a live hairline in the path's own fill color.
    if (/\sstroke-width="/.test(tag)) {
      return tag.replace(/\sstroke="[^"]*"/, ` stroke="${f[1]}"`).replace(/\sstroke-width="[^"]*"/, ` stroke-width="${CRACK_SEAL_WIDTH}"`);
    }
    return tag.replace(/<path\b/, `<path stroke="${f[1]}" stroke-width="${CRACK_SEAL_WIDTH}"`);
  });
}
// Snap the largest fill back to the source's exact dominant color.
// imagetracerjs averages each palette entry over its member pixels, which on
// a large flat background drifts a few units per channel — on near-white
// milky fills that drift reads as a green/teal tint next to the original.
// The dominant true-mean (measured from source pixels, see
// presets.dominantMeanColor) is the ground truth for that background: when
// the largest traced fill is already near it (< 60 units), repaint it
// exactly. Far-apart fills (e.g. a black background traced while the
// dominant sample caught a white border) are left untouched.
function snapLargestFillToDominant(svg: string, dominant: [number, number, number]): string {
  const areas = new Map<string, number>();
  const tagRe = /<path\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(svg)) !== null) {
    const tag = m[0];
    const f = /fill="rgb\((\d+),(\d+),(\d+)\)"/.exec(tag);
    if (!f) continue;
    const d = /\bd="([^"]*)"/.exec(tag)?.[1] ?? "";
    const nums = d.match(/-?\d+(?:\.\d+)?/g);
    let area = 0;
    if (nums && nums.length >= 4) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const x = Number(nums[i]);
        const y = Number(nums[i + 1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (Number.isFinite(minX)) area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
    }
    const key = `rgb(${f[1]},${f[2]},${f[3]})`;
    areas.set(key, (areas.get(key) ?? 0) + area);
  }
  let largestKey: string | null = null;
  let largestArea = 0;
  let largestRgb: [number, number, number] | null = null;
  for (const [key, area] of areas) {
    if (area > largestArea) {
      largestArea = area;
      largestKey = key;
      const parts = /rgb\((\d+),(\d+),(\d+)\)/.exec(key);
      if (parts) largestRgb = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
    }
  }
  if (!largestKey || !largestRgb) return svg;
  const dist = Math.sqrt(
    (largestRgb[0] - dominant[0]) ** 2 +
      (largestRgb[1] - dominant[1]) ** 2 +
      (largestRgb[2] - dominant[2]) ** 2
  );
  if (dist >= 60) return svg;
  const exact = `rgb(${dominant[0]},${dominant[1]},${dominant[2]})`;
  if (`rgb(${largestRgb[0]},${largestRgb[1]},${largestRgb[2]})` === exact) return svg;
  return svg.split(`fill="${largestKey}"`).join(`fill="${exact}"`).split(`stroke="${largestKey}"`).join(`stroke="${exact}"`);
}
// Strips output that imagetracerjs emits but that has zero visual effect —
// verified byte-for-byte inert, never touches path geometry or fill colors:
//   - `desc="Created with imagetracer.js..."` — authoring metadata only.
//   - `opacity="1"` — 1 is the SVG default; omitting it renders identically.
// (Zero-width strokes are NOT stripped here — sealCracks repurposes them as
// live hairlines, see above.)
// Plus four fidelity passes (stripSpeckles, mergeDuplicateFills,
// snapLargestFillToDominant, sealCracks) that intentionally alter output:
// micro-path deletion, near-duplicate fill unification, background-color
// snapping, and crack sealing. All geometry/color-conservative —
export function optimizeSvg(svg: string, dominant?: [number, number, number] | null): string {
  const cleaned = addViewBox(svg)
    .replace(/\s*desc="[^"]*"/g, "")
    .replace(/\s*opacity="1"(?=[\s/>])/g, "");
  // Scale speckle threshold to output size: ~0.5% of the longest side,
  // clamped 4–8px. On a 1500px illustration that drops sub-8px noise dots
  // while keeping real small details (shoe-lace highlights, eyelets,
  // stitching are typically 6px+ in at least one axis; whiskers/strokes are
  // long in one axis with real area). The old 0.8%/12px cutoff ate those
  // highlights, leaving the dark surroundings to cover them.
  const w = /<svg\b[^>]*\swidth=['"]([\d.]+)['"]/.exec(cleaned)?.[1];
  const h = /<svg\b[^>]*\sheight=['"]([\d.]+)['"]/.exec(cleaned)?.[1];
  const longest = Math.max(Number(w) || 0, Number(h) || 0);
  const minSize = longest > 0 ? Math.min(8, Math.max(4, longest * 0.005)) : 6;
  // dropSize == minSize: only delete a repainted path when it is truly tiny.
  // Anything bigger stays as geometry (see mergeDuplicateFills comment).
  const merged = mergeDuplicateFills(stripSpeckles(cleaned, minSize), minSize);
  const snapped = dominant ? snapLargestFillToDominant(merged, dominant) : merged;
  return sealCracks(snapped);
}
