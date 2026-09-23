// Post-trace SVG cleanup. Every pass here is opt-in per preset (see
// CleanupConfig) and was measured against the source raster — see
// scripts/preset-eval.mjs. Fidelity comes first: a pass earns its place only
// if rendering the cleaned SVG stays visually indistinguishable from the raw
// trace on the test set.

export interface CleanupConfig {
  // Drop isolated micro-paths / hairline slivers (flat art only). Size scales
  // with the image: clamp(longestSide * fraction, min, max) pixels.
  speckle: { fraction: number; min: number; max: number } | null;
  // Paint shapes as a stack (largest first) instead of tiles with cut-out
  // holes. Removes the hairline seams tiling leaves between neighbors without
  // changing any shape, and drops the duplicate hole geometry. Only applied to
  // fully opaque artwork.
  stackShapes: boolean;
  // rgb(r,g,b) -> #rgb / #rrggbb (lossless).
  compactColors: boolean;
  // Rebuild the trace as one single-color compound path on a transparent
  // background (Monochrome preset only).
  monochrome: boolean;
}

export interface OptimizeInput {
  cleanup: CleanupConfig;
  // The source had any non-opaque pixel (holes may then be real see-through).
  hasTransparency?: boolean;
  // The trace came from a flat-art palette. Only then are tiny paths noise:
  // in a photograph or gradient the small regions ARE the image.
  flat?: boolean;
}

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

interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function pathBox(d: string): Box | null {
  const nums = d.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 4) return null;
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
  return Number.isFinite(minX) ? { minX, maxX, minY, maxY } : null;
}

function dOf(tag: string): string {
  return /\bd="([^"]*)"/.exec(tag)?.[1] ?? "";
}

const RGB_FILL = /fill="rgb\((\d+),(\d+),(\d+)\)"/;
// Translucent paths (opacity < 1) are never stacked: their on-screen color
// depends on what is behind them.
const HAS_OPACITY = /\sopacity="(?!1")/;

// Paths, regions and holes. A traced <path> is one boundary plus everything
// nested under it, written as several subpaths with the nonzero rule: holes
// wind the opposite way to the outer boundary, and same-color "islands" inside
// those holes wind the same way. Splitting by winding gives independent
// regions (outer boundaries and islands) plus the holes cut out of them.
interface Sub {
  d: string;
  poly: [number, number][];
  box: Box;
  area: number; // absolute polygon area (endpoint approximation)
  hole: boolean;
}

interface ParsedPath {
  tag: string;
  subs: Sub[];
}

function polygonOf(outline: string): [number, number][] {
  const pts: [number, number][] = [];
  const re = /([MLQ])\s*((?:-?\d+(?:\.\d+)?\s*)+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(outline)) !== null) {
    const n = m[2].trim().split(/\s+/).map(Number);
    // For Q the last pair is the end point; the first is a control point.
    if (n.length >= 2) pts.push([n[n.length - 2], n[n.length - 1]]);
  }
  return pts;
}

function signedArea(poly: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return a / 2;
}

function parsePath(tag: string): ParsedPath | null {
  const raw = dOf(tag).trim().split(/(?=M\s)/).map((x) => x.trim()).filter(Boolean);
  if (raw.length === 0) return null;
  const subs: Sub[] = [];
  let outerSign = 0;
  for (const d of raw) {
    const poly = polygonOf(d);
    const box = pathBox(d);
    if (poly.length < 3 || !box) return null;
    const sa = signedArea(poly);
    const sign = Math.sign(sa);
    if (outerSign === 0) outerSign = sign;
    subs.push({ d, poly, box, area: Math.abs(sa), hole: sign !== outerSign });
  }
  return { tag, subs };
}

function withD(tag: string, d: string): string {
  return tag.replace(/\bd="[^"]*"/, `d="${d}"`);
}

// Drop anything smaller than minSize in BOTH axes (dots), and thin slivers:
// bbox area under minSize²/3 while the long side is still under minSize×2.
// Real detail survives either rule: eyes/fangs/text are compact but larger
// than minSize, and whiskers/strokes are long in at least one axis. Applied
// per subpath, so a dropped speck also closes the hole it left in its parent
// (the parent's color fills it) instead of leaving a page-colored dot.
function stripSpeckles(svg: string, minSize: number): string {
  const areaLimit = (minSize * minSize) / 3;
  const longLimit = minSize * 2;
  const tiny = (b: Box) => {
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    return (w < minSize && h < minSize) || (w * h < areaLimit && Math.max(w, h) < longLimit);
  };
  return svg.replace(/<path\b[^>]*>/g, (tag) => {
    const parsed = parsePath(tag);
    if (!parsed) return tag;
    if (tiny(parsed.subs[0].box)) return "";
    const kept = parsed.subs.filter((sub, i) => i === 0 || !tiny(sub.box));
    return kept.length === parsed.subs.length ? tag : withD(tag, kept.map((k) => k.d).join(" "));
  });
}

// A hole in one path is "filled" when another region has (nearly) the same
// outline. Those holes are pure duplicate geometry; unmatched holes reveal
// whatever was painted underneath and must be kept.
function isMatch(hole: Sub, region: Sub): boolean {
  const tol = 2.5;
  if (Math.abs(hole.box.minX - region.box.minX) > tol || Math.abs(hole.box.maxX - region.box.maxX) > tol) return false;
  if (Math.abs(hole.box.minY - region.box.minY) > tol || Math.abs(hole.box.maxY - region.box.maxY) > tol) return false;
  return Math.abs(hole.area - region.area) <= Math.max(6, 0.15 * hole.area);
}

interface Region {
  tag: string;
  outline: Sub;
  // Holes that are NOT duplicated by another region's outline.
  openHoles: Sub[];
  depth: number;
}

function buildRegions(tags: string[]): Region[] | null {
  const regions: Region[] = [];
  const holes: { owner: Region; sub: Sub }[] = [];
  for (const tag of tags) {
    const parsed = parsePath(tag);
    if (!parsed) return null;
    let current: Region | null = null;
    for (const sub of parsed.subs) {
      if (!sub.hole) {
        current = { tag, outline: sub, openHoles: [], depth: 0 };
        regions.push(current);
      } else if (current) {
        holes.push({ owner: current, sub });
      }
    }
  }
  for (const { owner, sub } of holes) {
    const matched = regions.some((r) => r !== owner && isMatch(sub, r.outline));
    if (!matched) owner.openHoles.push(sub);
  }
  return regions;
}

function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const MAX_STACKED_REGIONS = 3000;

// Shape stacking. Tiles with cut-out holes meet their neighbors along two
// independently anti-aliased edges, so a hairline of page shows through (the
// seams). Regions nest or are disjoint, so painting each region's OUTER
// outline, containers before contents, renders the same picture with each
// edge blended against its true neighbor instead of the page. Holes that no
// other region fills are kept (they reveal what is underneath).
// Fully opaque artwork only: with transparency or translucent fills a hole may
// be genuinely see-through, and stacking would fill it.
function stackShapes(svg: string): string {
  const start = svg.indexOf("<path");
  const end = svg.lastIndexOf("</svg>");
  if (start < 0 || end < 0) return svg;
  const tags = svg.slice(start, end).match(/<path\b[^>]*>/g);
  if (!tags || tags.length < 2) return svg;
  if (tags.some((t) => HAS_OPACITY.test(t))) return svg;
  const regions = buildRegions(tags);
  if (!regions || regions.length > MAX_STACKED_REGIONS) return svg;

  // depth = how many other regions enclose this one.
  for (const a of regions) {
    const [px, py] = a.outline.poly[0];
    for (const b of regions) {
      if (a === b) continue;
      const ab = a.outline.box;
      const bb = b.outline.box;
      if (ab.minX < bb.minX || ab.maxX > bb.maxX || ab.minY < bb.minY || ab.maxY > bb.maxY) continue;
      if (pointInPolygon(px, py, b.outline.poly)) a.depth += 1;
    }
  }
  const ordered = regions
    .map((r, index) => ({ r, index }))
    .sort((x, y) => x.r.depth - y.r.depth || y.r.outline.area - x.r.outline.area || x.index - y.index)
    .map(({ r }) => withD(r.tag, [r.outline.d, ...r.openHoles.map((h) => h.d)].join(" ")));
  return svg.slice(0, start) + ordered.join("") + svg.slice(end);
}

// imagetracerjs writes stroke="…" stroke-width="0" on every path: a zero-width
// stroke never renders, so it is dead weight when we aren't sealing cracks.
function stripDeadStrokes(svg: string): string {
  return svg.replace(/\s*stroke="[^"]*"\s*stroke-width="0"/g, "");
}

// Paths the tracer emits for fully transparent regions paint nothing.
function dropInvisiblePaths(svg: string): string {
  return svg.replace(/<path\b[^>]*\sopacity="0(?:\.0+)?"[^>]*>/g, "");
}

// opacity="0.9019607843137255" -> 0.902. Three decimals is finer than 8-bit
// alpha can express, so the rendering is identical.
function roundOpacity(svg: string): string {
  return svg.replace(/\sopacity="([\d.]+)"/g, (_m, v: string) => ` opacity="${Number(Number(v).toFixed(3))}"`);
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, "0");
}

// rgb(255,255,255) -> #fff. Lossless: only exact conversions.
function compactColors(svg: string): string {
  return svg.replace(/(fill|stroke)="rgb\((\d+),(\d+),(\d+)\)"/g, (_m, attr: string, r: string, g: string, b: string) => {
    const full = `${hex2(Number(r))}${hex2(Number(g))}${hex2(Number(b))}`;
    const short = full[0] === full[1] && full[2] === full[3] && full[4] === full[5] ? `${full[0]}${full[2]}${full[4]}` : full;
    return `${attr}="#${short}"`;
  });
}

// Monochrome: the tracer paints a stack of two-class regions (ink over
// background, with "holes" only implied by later, lighter paint). Convert that
// into ONE real compound path so holes are true holes (transparent on any
// background) and the result recolors in a single click.
//
// Regions in a two-class trace strictly alternate as they nest, so drawing
// every region's OUTER boundary once with the even-odd rule reproduces the
// artwork exactly. The outermost background region(s) — light regions that
// touch the image frame — are the "page" and are skipped.
function compileMonochrome(svg: string): string {
  const open = /<svg\b[^>]*>/.exec(svg)?.[0];
  if (!open) return svg;
  const w = Number(/\swidth="([\d.]+)"/.exec(open)?.[1]);
  const h = Number(/\sheight="([\d.]+)"/.exec(open)?.[1]);
  const tags = svg.match(/<path\b[^>]*>/g) ?? [];
  const regions = buildRegions(tags);
  if (!regions) return svg;
  const outlines: string[] = [];
  for (const r of regions) {
    const f = RGB_FILL.exec(r.tag);
    if (!f) continue;
    const lum = 0.299 * Number(f[1]) + 0.587 * Number(f[2]) + 0.114 * Number(f[3]);
    if (lum >= 128) {
      const b = r.outline.box;
      const touchesFrame = b.minX <= 0.01 || b.minY <= 0.01 || b.maxX >= w - 0.01 || b.maxY >= h - 0.01;
      if (touchesFrame) continue;
    }
    outlines.push(r.outline.d, ...r.openHoles.map((x) => x.d));
  }
  const body = outlines.length > 0 ? `<path fill="#000" fill-rule="evenodd" d="${outlines.join(" ")}"/>` : "";
  return `${open}${body}</svg>`;
}

export function optimizeSvg(svg: string, input: OptimizeInput): string {
  const { cleanup } = input;
  let out = addViewBox(svg)
    .replace(/\s*desc="[^"]*"/g, "")
    .replace(/\s*opacity="1"(?=[\s/>])/g, "");
  out = roundOpacity(dropInvisiblePaths(out));

  if (cleanup.monochrome) {
    out = compileMonochrome(out);
    return cleanup.compactColors ? compactColors(out) : out;
  }

  const sp = cleanup.speckle;
  if (sp && input.flat) {
    const wAttr = /<svg\b[^>]*\swidth=['"]([\d.]+)['"]/.exec(out)?.[1];
    const hAttr = /<svg\b[^>]*\sheight=['"]([\d.]+)['"]/.exec(out)?.[1];
    const longest = Math.max(Number(wAttr) || 0, Number(hAttr) || 0);
    const minSize = longest > 0 ? Math.min(sp.max, Math.max(sp.min, longest * sp.fraction)) : (sp.min + sp.max) / 2;
    out = stripSpeckles(out, minSize);
  }
  if (cleanup.stackShapes && !input.hasTransparency) out = stackShapes(out);
  out = stripDeadStrokes(out);
  if (cleanup.compactColors) out = compactColors(out);
  return out;
}
