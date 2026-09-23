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
  // snapToPalette). Low = smooth, simplified edges; high = keeps thin,
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

function sampleStride(pixelCount: number): number {
  return Math.max(1, Math.floor(pixelCount / 250_000));
}

// Finds the fills an image is really made of. Colors are grouped into coarse
// bins (16 levels per channel, 8 alpha levels); each bin's color is the exact
// most-common source color when one clearly dominates (flat art: the true
// fill, no averaging drift) and the mean otherwise (noisy sources).
export function buildPalette(data: Uint8ClampedArray, spec: PaletteSpec): PaletteResult | null {
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

  const candidates = [...bins.values()]
    .filter((b) => b.count / total >= spec.minShare)
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

  // Merge near-identical colors into the larger one (ringing bands, dithering).
  const accepted: { color: PaletteColor; count: number }[] = [];
  const limit = spec.mergeDistance * spec.mergeDistance;
  for (const c of candidates) {
    let host: { color: PaletteColor; count: number } | null = null;
    let best = Number.MAX_SAFE_INTEGER;
    for (const a of accepted) {
      const d =
        (c.color.r - a.color.r) ** 2 + (c.color.g - a.color.g) ** 2 + (c.color.b - a.color.b) ** 2 + (c.color.a - a.color.a) ** 2;
      if (d < best) {
        best = d;
        host = a;
      }
    }
    if (host && best < limit) host.count += c.count;
    else accepted.push({ color: c.color, count: c.count });
  }
  const kept = accepted.sort((a, b) => b.count - a.count).slice(0, spec.maxColors);
  const palette = kept.map((k) => k.color);
  // Coverage = share of sampled pixels that sit on one of the fills (within
  // the snap tolerance). Lossy sources smear each fill across several coarse
  // bins, so counting bins would under-report flat art.
  let covered = 0;
  const tol2 = spec.snapTolerance * spec.snapTolerance;
  for (let i = 0; i < data.length; i += 4 * stride) {
    const a = data[i + 3];
    if (a < ALPHA_CUTOFF) continue;
    for (const c of palette) {
      const da = (a - c.a) * 1.5;
      if ((data[i] - c.r) ** 2 + (data[i + 1] - c.g) ** 2 + (data[i + 2] - c.b) ** 2 + da * da <= tol2) {
        covered += 1;
        break;
      }
    }
  }
  // Transparent pixels are a "color" too: without an explicit entry the
  // tracer would assign them to the nearest translucent fill and paint the
  // whole background.
  if (transparent / (total + transparent) >= 0.0005) palette.push({ r: 0, g: 0, b: 0, a: 0 });
  return { palette, coverage: covered / total };
}

// Snap every pixel to a palette color so the tracer sees exactly the fills
// above. Pixels close to a palette color take it. In-between pixels do NOT
// take the nearest color — a blend of yellow and green is nearest some third
// color, which would trace as a ragged sliver of that color along every edge.
// Instead they take the label of the closest confident neighbor (multi-source
// flood from the confident pixels), so each edge resolves to one side or the
// other. Nearly-transparent pixels are transparent. Never mutates the
// caller's buffer.
export function snapToPalette(
  data: Uint8ClampedArray,
  palette: PaletteColor[],
  width: number,
  height: number,
  tolerance: number,
  smoothing = 0
): Uint8ClampedArray {
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

  for (let pass = 0; pass < smoothing; pass++) {
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

  const out = new Uint8ClampedArray(data.length);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const l = label[p];
    const c = palette[l];
    out[i] = c.r;
    out[i + 1] = c.g;
    out[i + 2] = c.b;
    out[i + 3] = c.a;
  }
  return out;
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
