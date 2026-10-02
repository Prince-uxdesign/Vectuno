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
const BLEND_MAX_INTERIOR = 0.35;
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
// for a band, high for a real area); `flanked` = share with BOTH colors of the
// suspected mix within FLANK_RADIUS. An edge blend lies between its two
// parents; a thin line of the same color (a grey hairline on white) has the
// same parent on both sides, so it isn't flanked and is kept. Indices of -1
// mean transparent.
const FLANK_RADIUS = 3;
const BLEND_MIN_FLANKED = 0.5;
const BLEND_MAX_PAIRS = 3;

function bandStats(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  palette: PaletteColor[],
  index: number,
  endA: number,
  endB: number
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
    let seenA = false;
    let seenB = false;
    for (let qy = Math.max(0, y - FLANK_RADIUS); qy <= Math.min(height - 1, y + FLANK_RADIUS) && !(seenA && seenB); qy++) {
      for (let qx = Math.max(0, x - FLANK_RADIUS); qx <= Math.min(width - 1, x + FLANK_RADIUS); qx++) {
        const l = nearestIndex(data, (qy * width + qx) * 4, palette);
        if (l === endA) seenA = true;
        else if (l === endB) seenB = true;
      }
    }
    if (seenA && seenB) flanked += 1;
  }
  return total === 0 ? { interior: 0, flanked: 0 } : { interior: interior / total, flanked: flanked / total };
}

function dropBlends(
  kept: { color: PaletteColor; count: number }[],
  data: Uint8ClampedArray,
  width: number,
  height: number,
  hasTransparent: boolean
): { color: PaletteColor; count: number }[] {
  const palette = kept.map((k) => k.color);
  const real: { color: PaletteColor; count: number }[] = [];
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
      const { interior, flanked } = bandStats(data, width, height, palette, index, pair.a, pair.b);
      const thin = pair.residual <= BLEND_RESIDUAL ? interior < BLEND_MAX_INTERIOR : interior < LOSSY_BLEND_MAX_INTERIOR;
      if (!thin) break;
      if (flanked >= BLEND_MIN_FLANKED) return;
    }
    real.push(c);
  });
  return real;
}

function sampleStride(pixelCount: number): number {
  return Math.max(1, Math.floor(pixelCount / 250_000));
}

// Finds the fills an image is really made of. Colors are grouped into coarse
// bins (16 levels per channel, 8 alpha levels); each bin's color is the exact
// most-common source color when one clearly dominates (flat art: the true
// fill, no averaging drift) and the mean otherwise (noisy sources).
export function buildPalette(data: Uint8ClampedArray, spec: PaletteSpec, width: number, height: number): PaletteResult | null {
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
  const palette = dropBlends(kept, data, width, height, hasTransparent).map((k) => k.color);
  // Transparent pixels are a "color" too: without an explicit entry the
  // tracer would assign them to the nearest translucent fill and paint the
  // whole background.
  if (hasTransparent) palette.push({ ...TRANSPARENT });
  return { palette, coverage: covered / total };
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
  smoothing = 0
): Int16Array {
  const n = width * height;
  const label = new Int16Array(n).fill(-1);
  const limit = tolerance * tolerance;
  const count = palette.length;
  const transparentIndex = palette.findIndex((c) => c.a === 0);

  const confident: number[] = [];
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const a = data[i + 3];
    if (a < ALPHA_CUTOFF) {
      if (transparentIndex >= 0) {
        label[p] = transparentIndex;
        confident.push(p);
      }
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

  majorityFilter(label, width, height, count, smoothing);

  return label;
}

// Passes of a 3x3 majority filter over a label map: a pixel switches only when
// at least 5 of its 9 neighbors (itself included) agree on another label, so
// one-pixel jitter goes while anything 3+ pixels thick stays.
function majorityFilter(label: Int16Array, width: number, height: number, count: number, passes: number): void {
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
        label[p] = bestVotes >= 5 ? best : own;
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
  // source pixel's size removes them; a one-pixel source line is `factor`
  // sub-pixels wide and survives.
  majorityFilter(out, outW, outH, palette.length, factor - 1);
  return paintLabels(out, palette);
}

// Bilinear upscale by an integer factor (premultiplied, so an edge fading to
// transparent doesn't pick up a dark fringe). Monochrome thresholds this
// directly: thresholding interpolated brightness is the two-color case of
// refineLabels.
export function upscaleBilinear(data: Uint8ClampedArray, width: number, height: number, factor: number): Uint8ClampedArray {
  if (factor === 1) return data;
  const outW = width * factor;
  const outH = height * factor;
  const out = new Uint8ClampedArray(outW * outH * 4);
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
      const ps = [y0 * width + x0, y0 * width + x1, y1 * width + x0, y1 * width + x1];
      const w = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < 4; k++) {
        const i = ps[k] * 4;
        const m = (data[i + 3] / 255) * w[k];
        r += data[i] * m;
        g += data[i + 1] * m;
        b += data[i + 2] * m;
        a += data[i + 3] * w[k];
      }
      const o = (y * outW + x) * 4;
      out[o + 3] = a;
      if (a > 0) {
        const un = 255 / a;
        out[o] = r * un;
        out[o + 1] = g * un;
        out[o + 2] = b * un;
      }
    }
  }
  return out;
}

// The same sub-pixel smoothing as refineLabels, for an ink/background bitmap
// (Monochrome thresholds an enlarged image directly).
export function smoothMonochrome(pixels: Uint8ClampedArray, width: number, height: number, passes: number): Uint8ClampedArray {
  if (passes <= 0) return pixels;
  const label = new Int16Array(width * height);
  for (let p = 0; p < label.length; p++) label[p] = pixels[p * 4] === 0 ? 0 : 1;
  majorityFilter(label, width, height, 2, passes);
  return paintLabels(label, [
    { r: 0, g: 0, b: 0, a: 255 },
    { r: 255, g: 255, b: 255, a: 255 },
  ]);
}

// ---- Monochrome preparation -------------------------------------------------
// Turns any artwork into a clean two-class (ink / background) bitmap for the
// Monochrome preset. Steps: composite over white (so transparency reads as
// background), pick an Otsu threshold on luminance, then decide which class is
// the *background* from the image border — so a white logo on black and a
// black logo on white both come out as "ink on background". Ink is always
// painted black, background white; the tracer then sees exactly two colors.
export function prepareMonochrome(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
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
  const out = new Uint8ClampedArray(data.length);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const isDark = lum[p] <= threshold;
    const ink = darkIsBackground ? !isDark : isDark;
    const v = ink ? 0 : 255;
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = 255;
  }
  return out;
}
