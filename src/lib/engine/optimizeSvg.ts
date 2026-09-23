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
// over the black" look). These are tiny in BOTH dimensions, unlike real
// thin detail (whiskers, text strokes) which is long in at least one axis.
// Parse each path's coordinate bbox from its d attribute and drop anything
// smaller than minSize in both axes. Pure string/regex work — no DOM needed
// (runs in the worker callback as well as tests).
function stripSpeckles(svg: string, minSize: number): string {
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
    if (maxX - minX < minSize && maxY - minY < minSize) return "";
    return tag;
  });
}
// Strips output that imagetracerjs emits but that has zero visual effect —
// verified byte-for-byte inert, never touches path geometry or fill colors:
//   - `desc="Created with imagetracer.js..."` — authoring metadata only.
//   - `stroke="..." stroke-width="0"` — a zero-width stroke never renders
//     per the SVG spec, so the attributes themselves are dead weight.
//   - `opacity="1"` — 1 is the SVG default; omitting it renders identically.
// Plus a deterministic speckle strip (see stripSpeckles above): unlike the
// three rules above this DOES remove paths, but only isolated micro-paths
// smaller than minSize in both axes — visual noise, not real detail.
export function optimizeSvg(svg: string): string {
  const cleaned = addViewBox(svg)
    .replace(/\s*desc="[^"]*"/g, "")
    .replace(/\s*stroke="[^"]*"\s*stroke-width="0"/g, "")
    .replace(/\s*opacity="1"(?=[\s/>])/g, "");
  // Scale speckle threshold to output size: ~0.8% of the longest side,
  // clamped 6–12px. On a 1200px cartoon that drops <10px dots while keeping
  // eyes/whiskers/text (long in at least one axis).
  const w = /<svg\b[^>]*\swidth=['"]([\d.]+)['"]/.exec(cleaned)?.[1];
  const h = /<svg\b[^>]*\sheight=['"]([\d.]+)['"]/.exec(cleaned)?.[1];
  const longest = Math.max(Number(w) || 0, Number(h) || 0);
  const minSize = longest > 0 ? Math.min(12, Math.max(6, longest * 0.008)) : 8;
  return stripSpeckles(cleaned, minSize);
}
