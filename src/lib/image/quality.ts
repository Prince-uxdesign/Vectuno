// Image-quality analysis for expectation-setting guidance. This never blocks
// anything — it only decides whether a calm, informational notice is shown
// alongside the workspace ("photographic detail", "quite small"). Both checks
// run over the decoded pixels with sampling, so they stay cheap on large
// images, and both are calibrated against test/fixtures (see thresholds).

export interface QualityAnalysis {
  // Many distinct colors with no dominant fills: photographs, gradients, and
  // very busy illustrations. Vectuno still converts them — the notice only
  // sets expectations and suggests simpler-friendly presets on failure.
  photoLike: boolean;
  // Source is so small that traced edges can't be much cleaner than the
  // input pixels. Non-blocking: icons this size convert fine.
  tiny: boolean;
  distinctColors: number;
  topCoverage: number;
}

export const TINY_LONGEST_SIDE_PX = 128;

// Calibrated against test/fixtures (12-bit bins, <=60k samples):
// - flat logos/icons: distinct 3-115, top8 coverage >= 0.94
// - JPEG logo (ringing noise): distinct 351, coverage 0.94 -> NOT flagged
// - detailed illustration: distinct 495, coverage 0.88 -> flagged (2nd rule)
// - gradient: distinct 133, coverage 0.19 -> flagged (1st rule)
// - photograph: distinct 511, coverage 0.33 -> flagged (1st rule)
const TOP_COVERAGE_PHOTO_MAX = 0.8;
const COMPLEX_DISTINCT_MIN = 450;
const COMPLEX_TOP_COVERAGE_MAX = 0.92;
const SAMPLE_BUDGET = 60_000;
const ALPHA_CUTOFF = 24;

export function analyzeQuality(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  originalWidth: number = width,
  originalHeight: number = height
): QualityAnalysis {
  const pixelCount = width * height;
  const stride = Math.max(1, Math.floor(pixelCount / SAMPLE_BUDGET));
  const bins = new Map<number, number>();
  let sampled = 0;
  for (let p = 0; p < pixelCount; p += stride) {
    const i = p * 4;
    if (data[i + 3] < ALPHA_CUTOFF) continue;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    bins.set(key, (bins.get(key) ?? 0) + 1);
    sampled += 1;
  }

  let topCoverage = 1;
  if (sampled > 0) {
    let topSum = 0;
    const counts = [...bins.values()].sort((a, b) => b - a).slice(0, 8);
    for (const c of counts) topSum += c;
    topCoverage = topSum / sampled;
  }

  const distinctColors = bins.size;
  const photoLike =
    sampled > 0 &&
    (topCoverage < TOP_COVERAGE_PHOTO_MAX ||
      (distinctColors > COMPLEX_DISTINCT_MIN && topCoverage < COMPLEX_TOP_COVERAGE_MAX));
  const tiny = Math.max(originalWidth, originalHeight) < TINY_LONGEST_SIDE_PX;

  return { photoLike, tiny, distinctColors, topCoverage };
}
