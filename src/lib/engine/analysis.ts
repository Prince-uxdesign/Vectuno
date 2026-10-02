// Pixel-level analysis used to plan and prepare a conversion. Pure functions
// over RGBA buffers; safe to run on the main thread or in the worker.

export interface PaletteColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface PaletteSpec {
  // Hard cap on palette size.
  maxColors: number;
  // A color must cover at least this share of opaque pixels to earn a slot.
  // Anti-aliasing and JPEG ringing spread thinly across many colors, so a
  // share floor keeps them out while real fills (however small) stay in.
  minShare: number;
  // Palette colors closer than this (RGB distance) are the same fill.
  mergeDistance: number;
  // A pixel within this RGB distance of a palette color is "on" that fill;
  // farther pixels are in-between blends resolved from their neighbors (see
  // snapLabels). Low = smooth, simplified edges; high = keeps thin,
  // anti-aliased detail.
  snapTolerance: number;
  // Passes of a 3x3 majority filter over the fill map: iron out one-pixel
  // jitter along edges (JPEG ringing) at the cost of sub-2px detail. 0 = off.
  smoothing: number;
}

export interface PaletteResult {
  palette: PaletteColor[];
  // Share of opaque pixels the palette accounts for. Flat art is ~1.0;
  // gradients and photographs spread across many colors and score low.
  coverage: number;
  // Colors that are mostly anti-aliasing blends (see dropBlends), appended at
  // the end of `palette`. snapLabels resolves them pixel by pixel.
  blends: BlendInfo | null;
}

export interface BlendInfo {
  // Index in the palette of the first blend color; all after it are blends.
  start: number;
  // For each blend color, the palette indices of the two fills it mixes.
  parents: [number, number][];
}

const ALPHA_CUTOFF = 24;

// Second-chance inclusion for small but genuinely distinct fills (a red mouth
// on a black cat, a white eye glint). The minShare floor exists to keep
// anti-aliasing and JPEG ringing out of the palette — but those always sit
// CLOSE to a real fill in color space, while a true accent sits far from
// everything. A rejected bin earns a leftover slot only if it is farther than
// this (RGB distance) from every accepted color...
const RESCUE_DISTANCE = 70;
// ...and still covers this share of sampled pixels, so single-pixel noise,
// dither scatter and stray compression specks can't claim slots either.
// 0.02% is ~10x below the smallest preset minShare: strictly a safety net.
const RESCUE_MIN_SHARE = 0.0002;

function dist4(a: PaletteColor, b: PaletteColor): number {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2 + (a.a - b.a) ** 2;
}

// ---- Anti-aliasing blend detection -------------------------------------------
// A soft or upscaled source has edge blends wide enough to clear the share
// floor (a purple/yellow edge leaves a band of mauve), and each one became its
// own fill: a ring of extra paths outlining every shape. A blend is recognised
// by three traits together: its color lies on the mix line between two
// stronger fills (premultiplied, so "fill fading to transparent" is a mix
// too), its pixels form thin bands rather than areas, and those bands run
// between the two fills it mixes (see bandStats). A genuine mid-tone fill (a
// grey between black and white) fails the second test and stays. Lossy sources
// shift edge colors off the exact mix line (JPEG stores color at a lower
// resolution than brightness), so a looser line is accepted when the color
// has next to no solid area at all.
const BLEND_RESIDUAL = 16;
const BLEND_MAX_INTERIOR = 0.25;
const LOSSY_BLEND_RESIDUAL = 40;
const LOSSY_BLEND_MAX_INTERIOR = 0.15;
const BLEND_MIN_MIX = 0.08;
const TRANSPARENT: PaletteColor = { r: 0, g: 0, b: 0, a: 0 };

function premultiplied(c: PaletteColor): [number, number, number, number] {
  const k = c.a / 255;
  return [c.r * k, c.g * k, c.b * k, c.a];
}

// Distance from c to the mix of a and b nearest to it (Infinity unless c is
// genuinely in between, not just next to one end).
function mixResidual(c: PaletteColor, a: PaletteColor, b: PaletteColor): number {
  const pc = premultiplied(c);
  const pa = premultiplied(a);
  const pb = premultiplied(b);
  let num = 0;
  let den = 0;
  for (let i = 0; i < 4; i++) {
    num += (pc[i] - pb[i]) * (pa[i] - pb[i]);
    den += (pa[i] - pb[i]) ** 2;
  }
  if (den === 0) return Infinity;
  const t = num / den;
  if (t < BLEND_MIN_MIX || t > 1 - BLEND_MIN_MIX) return Infinity;
  let d = 0;
  for (let i = 0; i < 4; i++) d += (pc[i] - (pb[i] + t * (pa[i] - pb[i]))) ** 2;
  return Math.sqrt(d);
}

function nearestIndex(data: Uint8ClampedArray, i: number, palette: PaletteColor[]): number {
  const a = data[i + 3];
  if (a < ALPHA_CUTOFF) return -1;
  let best = -1;
  let bestDist = Number.MAX_SAFE_INTEGER;
  for (let k = 0; k < palette.length; k++) {
    const c = palette[k];
    const da = (a - c.a) * 1.5;
    const d = (data[i] - c.r) ** 2 + (data[i + 1] - c.g) ** 2 + (data[i + 2] - c.b) ** 2 + da * da;
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  }
  return best;
}

// How the (sampled) pixels nearest to palette[index] sit in the image:
// `interior` = share whose whole 3x3 neighborhood is the same color (near zero
// for a band, high for a real area); `flanked` = share lying between the two
// colors of the suspected mix, one on each side (see FLANK_RADIUS). An edge
// blend lies between its two parents; a thin line of the same color (a grey
// hairline on white) has the same color on both sides, so it isn't flanked and
// is kept. Indices of -1 mean transparent; -2 is "nothing within reach".
// How far a blend pixel looks, each way, for the fills it lies between; the
// walk stops at the first stronger fill, so a long reach only lets wide (soft
// or blurred) ramps resolve.
const FLANK_RADIUS = 6;
// Ringing: how close to its host a fringe pixel must be.
const RING_RADIUS = 3;
const FLANK_DIRECTIONS: [number, number][] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];
const BLEND_MIN_FLANKED = 0.5;
const BLEND_MAX_PAIRS = 3;

function bandStats(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  palette: PaletteColor[],
  index: number,
  endA: number,
  // null: only endA is required nearby (see LOSSY_RING_*).
  endB: number | null,
  // Colors already found to be blends: stepped over like weaker colors.
  blendIndices: ReadonlySet<number> = new Set()
): { interior: number; flanked: number } {
  const stride = sampleStride(width * height);
  let total = 0;
  let interior = 0;
  let flanked = 0;
  for (let p = 0; p < width * height; p += stride) {
    const x = p % width;
    const y = (p - x) / width;
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) continue;
    if (nearestIndex(data, p * 4, palette) !== index) continue;
    total += 1;
    let solid = true;
    for (let dy = -1; dy <= 1 && solid; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (nearestIndex(data, (p + dy * width + dx) * 4, palette) !== index) {
          solid = false;
          break;
        }
      }
    }
    if (solid) interior += 1;
    if (endB === null) {
      // Ringing: endA anywhere within RING_RADIUS.
      let near = false;
      for (let qy = Math.max(0, y - RING_RADIUS); qy <= Math.min(height - 1, y + RING_RADIUS) && !near; qy++) {
        for (let qx = Math.max(0, x - RING_RADIUS); qx <= Math.min(width - 1, x + RING_RADIUS); qx++) {
          if (nearestIndex(data, (qy * width + qx) * 4, palette) === endA) {
            near = true;
            break;
          }
        }
      }
      if (near) flanked += 1;
    } else {
      // Blend: endA on one side and endB on the other, along some direction.
      // A thin line of this color drawn over one fill has that fill on both
      // sides, so it isn't flanked even where the other fill shows up nearby.
      const firstOther = (dx: number, dy: number) => {
        for (let k = 1; k <= FLANK_RADIUS; k++) {
          const qx = x + dx * k;
          const qy = y + dy * k;
          if (qx < 0 || qy < 0 || qx >= width || qy >= height) return -2;
          const l = nearestIndex(data, (qy * width + qx) * 4, palette);
          // Weaker colors (later in the palette) and known blends are stepped
          // over: a wide ramp holds several blend bands side by side.
          if (l !== index && l < index && !blendIndices.has(l)) return l;
        }
        return -2;
      };
      for (const [dx, dy] of FLANK_DIRECTIONS) {
        const ahead = firstOther(dx, dy);
        const behind = firstOther(-dx, -dy);
        if ((ahead === endA && behind === endB) || (ahead === endB && behind === endA)) {
          flanked += 1;
          break;
        }
      }
    }
  }
  return total === 0 ? { interior: 0, flanked: 0 } : { interior: interior / total, flanked: flanked / total };
}

// Lossy compression (JPEG, lossy WebP) also leaves ringing: a shifted copy of
// a fill smeared along that fill's edges (a darker purple fringing a purple
// shape). It is not a mix of two fills, so the blend test misses it, but it
// has the same tell: no solid area of its own, and nearly every pixel of it
// hugs the fill it came from. A real shade next to its base color (a shadow,
// a highlight) has a body of its own and is kept. Only applied to lossy
// sources: in a PNG the same pattern is more likely a deliberate thin outline.
const LOSSY_RING_MAX_DISTANCE = 90;
const LOSSY_RING_MAX_INTERIOR = 0.1;
const LOSSY_RING_MIN_NEAR_HOST = 0.75;
const LOSSY_RING_MIN_HOST_INTERIOR = 0.6;

function dropBlends(
  kept: { color: PaletteColor; count: number }[],
  data: Uint8ClampedArray,
  width: number,
  height: number,
  hasTransparent: boolean,
  lossy: boolean
): { real: { color: PaletteColor; count: number }[]; blends: { color: PaletteColor; parents: [PaletteColor, PaletteColor] }[] } {
  const palette = kept.map((k) => k.color);
  const real: { color: PaletteColor; count: number }[] = [];
  const blends: { color: PaletteColor; parents: [PaletteColor, PaletteColor] }[] = [];
  const hostInteriors = new Map<number, number>();
  const blendIndices = new Set<number>();
  kept.forEach((c, index) => {
    // Candidate parents: the stronger fills kept so far (-1 = transparent).
    const ends = real.map((r) => palette.indexOf(r.color));
    if (hasTransparent) ends.push(-1);
    const colorOf = (e: number) => (e < 0 ? TRANSPARENT : palette[e]);
    const pairs: { residual: number; a: number; b: number }[] = [];
    for (let i = 0; i < ends.length; i++) {
      for (let j = i + 1; j < ends.length; j++) {
        const residual = mixResidual(c.color, colorOf(ends[i]), colorOf(ends[j]));
        if (residual <= LOSSY_BLEND_RESIDUAL) pairs.push({ residual, a: ends[i], b: ends[j] });
      }
    }
    // A color can sit near several mix lines (an orange is near both
    // yellow+white and yellow+purple); the closest few are checked against
    // where the color actually is.
    pairs.sort((x, y) => x.residual - y.residual);
    for (const pair of pairs.slice(0, BLEND_MAX_PAIRS)) {
      const { interior, flanked } = bandStats(data, width, height, palette, index, pair.a, pair.b, blendIndices);
      const thin = pair.residual <= BLEND_RESIDUAL ? interior < BLEND_MAX_INTERIOR : interior < LOSSY_BLEND_MAX_INTERIOR;
      if (!thin) break;
      if (flanked >= BLEND_MIN_FLANKED) {
        blends.push({ color: c.color, parents: [colorOf(pair.a), colorOf(pair.b)] });
        blendIndices.add(index);
        return;
      }
    }
    if (lossy) {
      let host = -1;
      let hostDistance = LOSSY_RING_MAX_DISTANCE * LOSSY_RING_MAX_DISTANCE;
      for (const r of real) {
        const d = (r.color.r - c.color.r) ** 2 + (r.color.g - c.color.g) ** 2 + (r.color.b - c.color.b) ** 2;
        if (d <= hostDistance) {
          hostDistance = d;
          host = palette.indexOf(r.color);
        }
      }
      if (host >= 0) {
        const { interior, flanked } = bandStats(data, width, height, palette, index, host, null);
        if (interior <= LOSSY_RING_MAX_INTERIOR && flanked >= LOSSY_RING_MIN_NEAR_HOST) {
          // Ringing fringes a solid fill. In a photograph nothing is solid and
          // every tone hugs its neighbors, so there the rule would just strip
          // shading.
          let hostInterior = hostInteriors.get(host);
          if (hostInterior === undefined) {
            hostInterior = bandStats(data, width, height, palette, host, host, null).interior;
            hostInteriors.set(host, hostInterior);
          }
          if (hostInterior >= LOSSY_RING_MIN_HOST_INTERIOR) return;
        }
      }
    }
    real.push(c);
  });
  return { real, blends };
}

function sampleStride(pixelCount: number): number {
  return Math.max(1, Math.floor(pixelCount / 250_000));
}

// Finds the fills an image is really made of. Colors are grouped into coarse
// bins (16 levels per channel, 8 alpha levels); each bin's color is the exact
// most-common source color when one clearly dominates (flat art: the true
// fill, no averaging drift) and the mean otherwise (noisy sources).
export function buildPalette(
  data: Uint8ClampedArray,
  spec: PaletteSpec,
  width: number,
  height: number,
  // The source was lossily compressed (see LOSSY_RING_*).
  lossy = false,
  // Below this coverage the caller won't use the palette as flat art (or,
  // Infinity, doesn't want blend analysis at all), so it is skipped.
  minCoverage = 0
): PaletteResult | null {
  const stride = sampleStride(data.length / 4);
  interface Bin {
    count: number;
    sum: [number, number, number, number];
    exact: Map<number, number>;
  }
  const bins = new Map<number, Bin>();
  let total = 0;
  let transparent = 0;
  for (let i = 0; i < data.length; i += 4 * stride) {
    const a = data[i + 3];
    if (a < ALPHA_CUTOFF) {
      transparent += 1;
      continue;
    }
    const key = ((data[i] >> 4) << 15) | ((data[i + 1] >> 4) << 11) | ((data[i + 2] >> 4) << 7) | (a >> 5);
    let bin = bins.get(key);
    if (!bin) {
      bin = { count: 0, sum: [0, 0, 0, 0], exact: new Map() };
      bins.set(key, bin);
    }
    bin.count += 1;
    bin.sum[0] += data[i];
    bin.sum[1] += data[i + 1];
    bin.sum[2] += data[i + 2];
    bin.sum[3] += a;
    const packed = (data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | a;
    bin.exact.set(packed, (bin.exact.get(packed) ?? 0) + 1);
    total += 1;
  }
  if (total === 0) return null;

  // Resolve every sampled bin to a single color first; the share floor is
  // applied below, and bins that miss it still get a second chance (rescue).
  const colored = [...bins.values()]
    .sort((a, b) => b.count - a.count)
    .map((bin) => {
      let bestPacked = 0;
      let bestCount = 0;
      for (const [packed, c] of bin.exact) {
        if (c > bestCount) {
          bestCount = c;
          bestPacked = packed;
        }
      }
      const color: PaletteColor =
        bestCount / bin.count >= 0.4
          ? { r: (bestPacked >>> 24) & 255, g: (bestPacked >>> 16) & 255, b: (bestPacked >>> 8) & 255, a: bestPacked & 255 }
          : {
              r: Math.round(bin.sum[0] / bin.count),
              g: Math.round(bin.sum[1] / bin.count),
              b: Math.round(bin.sum[2] / bin.count),
              a: Math.round(bin.sum[3] / bin.count),
            };
      return { color, count: bin.count };
    });

  const candidates = colored.filter((c) => c.count / total >= spec.minShare);

  // Merge near-identical colors into the larger one (ringing bands, dithering).
  const accepted: { color: PaletteColor; count: number }[] = [];
  const limit = spec.mergeDistance * spec.mergeDistance;
  for (const c of candidates) {
    let host: { color: PaletteColor; count: number } | null = null;
    let best = Number.MAX_SAFE_INTEGER;
    for (const a of accepted) {
      const d = dist4(c.color, a.color);
      if (d < best) {
        best = d;
        host = a;
      }
    }
    if (host && best < limit) host.count += c.count;
    else accepted.push({ color: c.color, count: c.count });
  }
  const kept = accepted.sort((a, b) => b.count - a.count).slice(0, spec.maxColors);

  // Rescue: small distinct accents the share floor rejected. Only leftover
  // slots are used, largest first, so the primary palette is untouched and a
  // genuinely busy image (no free slots) behaves exactly as before.
  if (kept.length < spec.maxColors) {
    const rescueLimit = RESCUE_DISTANCE * RESCUE_DISTANCE;
    for (const c of colored) {
      if (kept.length >= spec.maxColors) break;
      if (c.count / total < RESCUE_MIN_SHARE) break; // sorted desc: nothing smaller qualifies
      if (c.count / total >= spec.minShare) continue; // already accepted or merged
      const far = kept.every((k) => dist4(c.color, k.color) > rescueLimit);
      if (far) kept.push({ color: c.color, count: c.count });
    }
    kept.sort((a, b) => b.count - a.count);
  }

  const candidatePalette = kept.map((k) => k.color);
  // Coverage = share of sampled pixels that sit on one of the fills (within
  // the snap tolerance). Lossy sources smear each fill across several coarse
  // bins, so counting bins would under-report flat art.
  let covered = 0;
  const tol2 = spec.snapTolerance * spec.snapTolerance;
  for (let i = 0; i < data.length; i += 4 * stride) {
    const a = data[i + 3];
    if (a < ALPHA_CUTOFF) continue;
    for (const c of candidatePalette) {
      const da = (a - c.a) * 1.5;
      if ((data[i] - c.r) ** 2 + (data[i + 1] - c.g) ** 2 + (data[i + 2] - c.b) ** 2 + da * da <= tol2) {
        covered += 1;
        break;
      }
    }
  }
  // Coverage is measured before blends are dropped: blend pixels are edges
  // of the fills above, so they still count as explained by them.
  const hasTransparent = transparent / (total + transparent) >= 0.0005;
  const coverage = covered / total;
  const split = coverage >= minCoverage ? dropBlends(kept, data, width, height, hasTransparent, lossy) : { real: kept, blends: [] };
  const palette = split.real.map((k) => k.color);
  // Transparent pixels are a "color" too: without an explicit entry the
  // tracer would assign them to the nearest translucent fill and paint the
  // whole background.
  if (hasTransparent) palette.push(TRANSPARENT);
  const start = palette.length;
  const parents = split.blends.map((b) => b.parents.map((c) => palette.indexOf(c)) as [number, number]);
  palette.push(...split.blends.map((b) => b.color));
  return { palette, coverage, blends: split.blends.length > 0 ? { start, parents } : null };
}

// Snap every pixel to a palette color so the tracer sees exactly the fills
// above. Pixels close to a palette color take it. In-between pixels do NOT
// take the nearest color — a blend of yellow and green is nearest some third
// color, which would trace as a ragged sliver of that color along every edge.
// Instead they take the label of the closest confident neighbor (multi-source
// flood from the confident pixels), so each edge resolves to one side or the
// other. Nearly-transparent pixels are transparent. Returns one palette index
// per pixel; never mutates the caller's buffer.
export function snapLabels(
  data: Uint8ClampedArray,
  palette: PaletteColor[],
  width: number,
  height: number,
  tolerance: number,
  smoothing = 0,
  blends: BlendInfo | null = null
): Int16Array {
  const n = width * height;
  const label = new Int16Array(n).fill(-1);
  const limit = tolerance * tolerance;
  const count = palette.length;
  const transparentIndex = palette.findIndex((c) => c.a === 0);

  const confident: number[] = [];
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const a = data[i + 3];
    // Without a transparent entry (too few transparent pixels to earn one, or
    // none sampled) a near-transparent pixel is matched like any other.
    if (a < ALPHA_CUTOFF && transparentIndex >= 0) {
      label[p] = transparentIndex;
      confident.push(p);
      continue;
    }
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let best = -1;
    let bestDist = Number.MAX_SAFE_INTEGER;
    for (let k = 0; k < count; k++) {
      const c = palette[k];
      if (c.a === 0) continue;
      const da = (a - c.a) * 1.5;
      const d = (r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2 + da * da;
      if (d < bestDist) {
        bestDist = d;
        best = k;
      }
    }
    if (best >= 0 && bestDist <= limit) {
      label[p] = best;
      confident.push(p);
    } else {
      // Remember the nearest color in case no confident neighbor ever reaches
      // this pixel (an image with no confident pixels at all).
      label[p] = -2 - Math.max(best, 0);
    }
  }

  // Blend colors (see BlendInfo) are only edges where they actually sit
  // between their two parent fills, one on each side: those pixels become
  // in-between pixels, resolved below like any other edge. Elsewhere (grey
  // lettering on a white cup, while the same grey also blends black lines
  // into the background) the color is real and the pixel keeps it.
  if (blends) {
    const firstOther = (x: number, y: number, dx: number, dy: number, own: number) => {
      for (let k = 1; k <= FLANK_RADIUS; k++) {
        const qx = x + dx * k;
        const qy = y + dy * k;
        if (qx < 0 || qy < 0 || qx >= width || qy >= height) return -2;
        const l = label[qy * width + qx];
        if (l === own || l < 0 || l >= blends.start) continue;
        return l;
      }
      return -2;
    };
    const demoted: number[] = [];
    for (let p = 0; p < n; p++) {
      const l = label[p];
      if (l < blends.start) continue;
      const [a, b] = blends.parents[l - blends.start];
      const x = p % width;
      const y = (p - x) / width;
      for (const [dx, dy] of FLANK_DIRECTIONS) {
        const ahead = firstOther(x, y, dx, dy, l);
        const behind = firstOther(x, y, -dx, -dy, l);
        if ((ahead === a && behind === b) || (ahead === b && behind === a)) {
          demoted.push(p);
          break;
        }
      }
    }
    for (const p of demoted) label[p] = -2 - blends.parents[label[p] - blends.start][0];
    if (demoted.length > 0) {
      let kept = 0;
      for (const p of confident) if (label[p] >= 0) confident[kept++] = p;
      confident.length = kept;
    }
  }

  // Resolve in-between pixels in waves from the confident ones. Each takes,
  // among the already-labeled neighbors, the label whose color is closest to
  // its own — so an edge blend lands on whichever side it actually resembles.
  const queued = new Uint8Array(n);
  let frontier: number[] = [];
  const enqueueUnknownNeighbors = (p: number, into: number[]) => {
    const x = p % width;
    const y = (p - x) / width;
    const visit = (q: number) => {
      if (label[q] < -1 && !queued[q]) {
        queued[q] = 1;
        into.push(q);
      }
    };
    if (x > 0) visit(p - 1);
    if (x < width - 1) visit(p + 1);
    if (y > 0) visit(p - width);
    if (y < height - 1) visit(p + width);
  };
  for (const p of confident) enqueueUnknownNeighbors(p, frontier);
  while (frontier.length > 0) {
    const chosen = new Int16Array(frontier.length);
    for (let f = 0; f < frontier.length; f++) {
      const p = frontier[f];
      const i = p * 4;
      const x = p % width;
      const y = (p - x) / width;
      let best = -1;
      let bestDist = Number.MAX_SAFE_INTEGER;
      const consider = (q: number) => {
        const l = label[q];
        if (l < 0) return;
        const c = palette[l];
        const da = (data[i + 3] - c.a) * 1.5;
        const d = (data[i] - c.r) ** 2 + (data[i + 1] - c.g) ** 2 + (data[i + 2] - c.b) ** 2 + da * da;
        if (d < bestDist) {
          bestDist = d;
          best = l;
        }
      };
      if (x > 0) consider(p - 1);
      if (x < width - 1) consider(p + 1);
      if (y > 0) consider(p - width);
      if (y < height - 1) consider(p + width);
      chosen[f] = best;
    }
    const next: number[] = [];
    for (let f = 0; f < frontier.length; f++) {
      const p = frontier[f];
      if (chosen[f] >= 0) label[p] = chosen[f];
    }
    for (let f = 0; f < frontier.length; f++) {
      const p = frontier[f];
      if (label[p] >= 0) enqueueUnknownNeighbors(p, next);
    }
    frontier = next;
  }
  for (let p = 0; p < n; p++) if (label[p] < -1) label[p] = -2 - label[p]; // unreachable leftovers keep their nearest color

  // Real one-pixel lines are kept out of the smoothing: it is there for edge
  // jitter, and once blend pixels beside a line resolve to the background the
  // line is all that's left of it.
  majorityFilter(label, width, height, count, smoothing, 5, smoothing > 0 && blends ? thinLines(label, width, height) : null);

  return label;
}

// Pixels on a one-pixel-thin line: unlike both neighbors across the line, and
// with the line continuing through them (same-colored neighbors on both sides
// along it). A one-pixel bump off an edge or a lone speck has no continuation
// on one side, so it isn't protected. Outside the image counts as different,
// so a line along the border qualifies too.
function thinLines(label: Int16Array, width: number, height: number): Uint8Array {
  const thin = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const l = label[p];
      const same = (dx: number, dy: number) => {
        const qx = x + dx;
        const qy = y + dy;
        return qx >= 0 && qy >= 0 && qx < width && qy < height && label[qy * width + qx] === l;
      };
      const acrossX = !same(-1, 0) && !same(1, 0);
      const acrossY = !same(0, -1) && !same(0, 1);
      const runsY = (same(-1, -1) || same(0, -1) || same(1, -1)) && (same(-1, 1) || same(0, 1) || same(1, 1));
      const runsX = (same(-1, -1) || same(-1, 0) || same(-1, 1)) && (same(1, -1) || same(1, 0) || same(1, 1));
      if ((acrossX && runsY) || (acrossY && runsX)) thin[p] = 1;
    }
  }
  return thin;
}

// Passes of a 3x3 majority filter over a label map: a pixel switches only when
// at least `minVotes` of its 9 neighbors (itself included) agree on another
// label, so one-pixel jitter goes while anything 3+ pixels thick stays. At 5,
// convex corners round off by a pixel per pass; at 6 they hold. Pixels marked
// in `keep` never switch.
function majorityFilter(
  label: Int16Array,
  width: number,
  height: number,
  count: number,
  passes: number,
  minVotes = 5,
  keep: Uint8Array | null = null
): void {
  for (let pass = 0; pass < passes; pass++) {
    const src = label.slice();
    const votes = new Uint16Array(count);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const p = y * width + x;
        const own = src[p];
        let best = own;
        let bestVotes = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            votes[src[p + dy * width + dx]] += 1;
          }
        }
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const l = src[p + dy * width + dx];
            if (votes[l] > bestVotes) {
              bestVotes = votes[l];
              best = l;
            }
          }
        }
        // Only a clear majority overrides the pixel's own label.
        label[p] = bestVotes >= minVotes && !keep?.[p] ? best : own;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) votes[src[p + dy * width + dx]] = 0;
        }
      }
    }
  }
}

function paintLabels(label: Int16Array, palette: PaletteColor[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(label.length * 4);
  for (let p = 0, i = 0; p < label.length; p++, i += 4) {
    const c = palette[label[p]];
    out[i] = c.r;
    out[i + 1] = c.g;
    out[i + 2] = c.b;
    out[i + 3] = c.a;
  }
  return out;
}

// ---- Supersampling ------------------------------------------------------------
// Snapping decides each anti-aliased edge pixel wholesale, which throws away
// where inside that pixel the edge really ran: the boundary becomes a ragged
// 1px staircase, and the tracer faithfully fits that jitter. So the snapped
// result is enlarged and its boundaries re-decided at sub-pixel resolution
// (see refineLabels); the trace runs on that and is scaled back down (see
// rescaleTrace). Bounded by a pixel budget — the tracer's memory grows with
// pixels × colors — so large images trace at 1x, where a pixel of jitter is
// relatively small anyway.
const SUPERSAMPLE_PIXEL_BUDGET = 2_500_000;
// A pixel within this (premultiplied RGBA) distance of its fill is that fill,
// not an edge blend (see refineLabels).
const PURE_DISTANCE = 12;
// How many pixels each edge must run straight past a crisp corner for it to
// be locked (see refineLabels).
const LOCK_RUN = 1;
const MAX_SUPERSAMPLE = 3;

export function supersampleFactor(width: number, height: number): number {
  const fit = Math.floor(Math.sqrt(SUPERSAMPLE_PIXEL_BUDGET / Math.max(1, width * height)));
  return Math.max(1, Math.min(MAX_SUPERSAMPLE, fit));
}

// Enlarges a snapped label map by `factor` and paints it. Each output pixel
// sits among four source pixels (bilinear neighborhood). Where they share one
// fill, that fill is kept as is — so everything snapping kept at 1x, down to
// one-pixel lines, survives exactly. Where they differ (an edge), the source
// colors are interpolated at that point and the pixel takes whichever of the
// local fills that color is mostly made of: the 50% point of the
// anti-aliasing ramp, i.e. where the edge really is.
export function refineLabels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  label: Int16Array,
  palette: PaletteColor[],
  factor: number
): Uint8ClampedArray {
  if (factor === 1) return paintLabels(label, palette);
  const outW = width * factor;
  const outH = height * factor;
  const out = new Int16Array(outW * outH);
  const pm = palette.map(premultiplied);
  // One-pixel-thin lines keep their whole pixel: re-deciding them at the 50%
  // point would shrink a faint hairline to a sub-pixel sliver that the
  // smoothing below then erases.
  const thin = thinLines(label, width, height);
  // Pixels that already are exactly their fill (crisp art, solid interiors).
  const pure = new Uint8Array(width * height);
  for (let p = 0; p < pure.length; p++) {
    const i = p * 4;
    const k = data[i + 3] / 255;
    const c = pm[label[p]];
    const d = (data[i] * k - c[0]) ** 2 + (data[i + 1] * k - c[1]) ** 2 + (data[i + 2] * k - c[2]) ** 2 + (data[i + 3] - c[3]) ** 2;
    if (d <= PURE_DISTANCE * PURE_DISTANCE) pure[p] = 1;
  }
  // A crisp square corner (a pure pixel where two straight edges, each at
  // least three pixels long, meet) is locked: the 50% contour of the
  // interpolation would round it by a sub-pixel and the tracer then cuts
  // across it, skewing whole sides. The short steps of an aliased diagonal
  // are corners too, but their runs are short, so they are still refined
  // into a smooth slope.
  const lock = new Uint8Array(width * height);
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < width && y < height ? label[y * width + x] : -1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (!pure[p]) continue;
      const l = label[p];
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        if (at(x + dx, y) === l || at(x, y + dy) === l) continue;
        let straight = true;
        for (let k = 1; k <= LOCK_RUN && straight; k++) {
          straight =
            at(x - k * dx, y) === l && at(x - k * dx, y + dy) !== l && at(x, y - k * dy) === l && at(x + dx, y - k * dy) !== l;
        }
        if (straight) {
          lock[p] = 1;
          break;
        }
      }
    }
  }
  const px = [0, 0, 0, 0];
  const cands: number[] = [];
  for (let y = 0; y < outH; y++) {
    const sy = Math.min(height - 1, Math.max(0, (y + 0.5) / factor - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(height - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(width - 1, Math.max(0, (x + 0.5) / factor - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(width - 1, x0 + 1);
      const fx = sx - x0;
      const p00 = y0 * width + x0;
      const p01 = y0 * width + x1;
      const p10 = y1 * width + x0;
      const p11 = y1 * width + x1;
      const l00 = label[p00];
      const o = y * outW + x;
      const own = Math.floor(y / factor) * width + Math.floor(x / factor);
      if (thin[own] || lock[own]) {
        out[o] = label[own];
        continue;
      }
      if (l00 === label[p01] && l00 === label[p10] && l00 === label[p11]) {
        out[o] = l00;
        continue;
      }
      const w = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      const ps = [p00, p01, p10, p11];
      px[0] = px[1] = px[2] = px[3] = 0;
      cands.length = 0;
      for (let k = 0; k < 4; k++) {
        const i = ps[k] * 4;
        const alpha = data[i + 3];
        const m = (alpha / 255) * w[k];
        px[0] += data[i] * m;
        px[1] += data[i + 1] * m;
        px[2] += data[i + 2] * m;
        px[3] += alpha * w[k];
        const l = label[ps[k]];
        if (!cands.includes(l)) cands.push(l);
      }
      // The pair of local fills this color lies between, split at 50%.
      let choice = cands[0];
      let bestResidual = Infinity;
      for (let u = 0; u < cands.length; u++) {
        for (let v = u + 1; v < cands.length; v++) {
          const a = pm[cands[u]];
          const b = pm[cands[v]];
          let num = 0;
          let den = 0;
          for (let ch = 0; ch < 4; ch++) {
            num += (px[ch] - b[ch]) * (a[ch] - b[ch]);
            den += (a[ch] - b[ch]) ** 2;
          }
          const t = den === 0 ? 1 : Math.min(1, Math.max(0, num / den));
          let residual = 0;
          for (let ch = 0; ch < 4; ch++) residual += (px[ch] - (b[ch] + t * (a[ch] - b[ch]))) ** 2;
          if (residual < bestResidual) {
            bestResidual = residual;
            choice = t >= 0.5 ? cands[u] : cands[v];
          }
        }
      }
      out[o] = choice;
    }
  }
  // Each boundary pixel above is decided on its own, which leaves single
  // sub-pixel bumps along edges for the tracer to chase. Smoothing below a
  // source pixel's size removes them; a one-pixel source line is kept
  // `factor` sub-pixels wide above, and survives.
  // Sub-pixels of locked corners and thin lines are left out of the smoothing
  // (it would chamfer the one and nibble the other).
  const settled = new Uint8Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    const row = Math.floor(y / factor) * width;
    for (let x = 0; x < outW; x++) {
      const own = row + Math.floor(x / factor);
      if (lock[own] || thin[own]) settled[y * outW + x] = 1;
    }
  }
  majorityFilter(out, outW, outH, palette.length, factor - 1, 5, settled);
  // Nothing snapping kept may vanish in the refinement or the smoothing. A
  // one-pixel-thin pixel that lost every sub-pixel and has no solid (pure)
  // neighbor of its own color is part of a faint feature, such as a very thin
  // line with no solid pixels at all; it keeps its whole pixel instead.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const l = label[p];
      // A line lies on one background: across it, the same other color on
      // both sides. A stray pixel on the edge between two other colors (a
      // blend snapped to a third) has different colors either side, and
      // vanishing is right for it.
      const left = x > 0 ? label[p - 1] : -1;
      const right = x < width - 1 ? label[p + 1] : -1;
      const up = y > 0 ? label[p - width] : -1;
      const down = y < height - 1 ? label[p + width] : -1;
      const lineX = left !== l && left === right;
      const lineY = up !== l && up === down;
      if (!lineX && !lineY) continue;
      let anchored = false;
      for (let dy = -1; dy <= 1 && !anchored; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const qx = x + dx;
          const qy = y + dy;
          if ((dx || dy) && qx >= 0 && qy >= 0 && qx < width && qy < height && label[qy * width + qx] === l && pure[qy * width + qx]) {
            anchored = true;
            break;
          }
        }
      }
      if (anchored) continue;
      let kept = false;
      for (let sy = 0; sy < factor && !kept; sy++) {
        for (let sx = 0, o = (y * factor + sy) * outW + x * factor; sx < factor; sx++, o++) {
          if (out[o] === l) {
            kept = true;
            break;
          }
        }
      }
      if (kept) continue;
      for (let sy = 0; sy < factor; sy++) out.fill(l, (y * factor + sy) * outW + x * factor, (y * factor + sy) * outW + (x + 1) * factor);
    }
  }
  return paintLabels(out, palette);
}

// ---- Monochrome preparation -------------------------------------------------
// Turns any artwork into a clean two-class (ink / background) bitmap for the
// Monochrome preset. Steps: composite over white (so transparency reads as
// background), pick an Otsu threshold on luminance, then decide which class is
// the *background* from the image border — so a white logo on black and a
// black logo on white both come out as "ink on background". Painted with
// MONOCHROME_PALETTE (black ink, white background) the tracer sees exactly two
// colors.
export function prepareMonochrome(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { levels: Uint8ClampedArray; labels: Int16Array } {
  const n = width * height;
  const lum = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const a = data[i + 3] / 255;
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const eff = Math.round(255 - (255 - l) * a);
    lum[p] = eff;
    hist[eff] += 1;
  }
  // Otsu: maximize between-class variance.
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let wB = 0;
  let sumB = 0;
  let best = -1;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  // Border majority decides which class is background.
  let borderDark = 0;
  let borderTotal = 0;
  const probe = (x: number, y: number) => {
    borderTotal += 1;
    if (lum[y * width + x] <= threshold) borderDark += 1;
  };
  for (let x = 0; x < width; x++) {
    probe(x, 0);
    probe(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    probe(0, y);
    probe(width - 1, y);
  }
  const darkIsBackground = borderTotal > 0 && borderDark / borderTotal > 0.5;
  // Each pixel's decision (0 = ink, 1 = background), plus a level for
  // refineLabels: brightness rescaled so the ink class's average is 0 and the
  // background's is 255. Edges then land midway between what ink and
  // background actually look like — not at the threshold, which for faint ink
  // (light grey lines) sits right on the ink and would thin every line.
  let darkSum = 0;
  let darkCount = 0;
  let lightSum = 0;
  for (let p = 0; p < n; p++) {
    if (lum[p] <= threshold) {
      darkSum += lum[p];
      darkCount += 1;
    } else lightSum += lum[p];
  }
  const darkMean = darkCount > 0 ? darkSum / darkCount : 0;
  const lightMean = n - darkCount > 0 ? lightSum / (n - darkCount) : 255;
  const inkMean = darkIsBackground ? lightMean : darkMean;
  const paperMean = darkIsBackground ? darkMean : lightMean;
  const span = paperMean - inkMean || 1;
  const levels = new Uint8ClampedArray(data.length);
  const labels = new Int16Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const isDark = lum[p] <= threshold;
    labels[p] = (darkIsBackground ? !isDark : isDark) ? 0 : 1;
    const v = ((lum[p] - inkMean) / span) * 255;
    levels[i] = v;
    levels[i + 1] = v;
    levels[i + 2] = v;
    levels[i + 3] = 255;
  }
  return { levels, labels };
}

export const MONOCHROME_PALETTE: PaletteColor[] = [
  { r: 0, g: 0, b: 0, a: 255 },
  { r: 255, g: 255, b: 255, a: 255 },
];
