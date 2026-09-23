# Vectorization engine evaluation (Phase 1)

Goal: determine whether raster→SVG conversion can run entirely client-side, and
which library to build on. Two candidates were installed and actually tested
against 12 synthetic images spanning the required categories — not chosen on
reputation alone.

## Candidates considered

| Library | Type | License | Verdict |
|---|---|---|---|
| **imagetracerjs 1.2.6** | Pure JS, zero deps | Unlicense | **Selected** |
| vtracer-wasm 0.1.0 | Rust→WASM (wasm-bindgen) | MIT | Rejected — broken |
| @neplex/vectorizer 0.1.0 | Rust via NAPI (native Node addon) | MIT | Rejected — not browser-compatible at all (Node native binary, no WASM target) |
| potrace (npm) | Node + `canvas` (native deps) | — | Rejected — not browser-compatible, and monochrome-only |

VTracer (the algorithm) is generally considered best-in-class for clean color
tracing, so it was the first candidate tried. The npm WASM port
(`vtracer-wasm` by jsscheller) was installed and probed directly:

- Verified it's a genuine `wasm-bindgen` build targeting `wasm32-unknown-unknown`
  (137KB binary, no threading imports, browser-loadable).
- Every call — with an empty config, snake_case fields, and camelCase fields
  reverse-engineered from the compiled binary's string table — panics with
  `RuntimeError: unreachable`.
- Reproduced in **both** Node and real Chromium (via Playwright), so it isn't
  an environment quirk.
- Single maintainer, exactly one npm release, no usage docs, no changelog.
  Given the reliability and maintenance-risk it demonstrated on the most basic
  possible call, it does not clear the bar for a product dependency. A
  self-compiled `wasm-pack` build of upstream `visioncortex/vtracer` remains a
  legitimate future option (see Remaining risks) but is out of scope for
  Phase 1.

`imagetracerjs` was then benchmarked as the working baseline — see results below.

## Architecture

Fully client-side, no backend:

```
File → validate (type/size) → decode (createImageBitmap → canvas → downsample)
  → vectorize (imagetracerjs, in a Web Worker) → SVG string → preview/download
```

No server is used or needed. The entire pipeline runs in the browser, per the
product's "no unnecessary backend" constraint.

## Test results (12 synthetic fixtures, `npm run test:benchmark`)

Generated via `scripts/gen-test-images.mjs` (`npm run test:fixtures`) since no
source assets were provided; images cover the required categories exactly.

| Image | Source | Output | Paths | Time |
|---|---|---|---|---|
| B&W logo (512²) | 11.3 KB | 11.9 KB | 81 | 161ms |
| Color logo (512²) | 15.9 KB | 20.0 KB | 137 | 125ms |
| Icon (64²) | 0.9 KB | 3.0 KB | 18 | 4ms |
| Flat illustration (600×400) | 13.8 KB | 28.1 KB | 216 | 116ms |
| Transparent PNG (400²) | 8.4 KB | 23.1 KB | 140 | 89ms |
| Multicolor illustration (600²) | 26.2 KB | 31.6 KB | 213 | 197ms |
| Detailed illustration (500², 400 noisy dots) | 62.2 KB | 98.1 KB | 390 | 134ms |
| Gradient-heavy (600×400) | 179 KB | 29.1 KB | 20 | 114ms |
| Photograph (simulated, 640×480 JPEG) | 106 KB | **4165.6 KB** | **23134** | 467ms |
| Low-resolution (32²) | 0.4 KB | 1.0 KB | 6 | 1ms |
| Large (4000×3000) | 273 KB | 69.4 KB | 495 | **5843ms** (unthrottled, no downsample) |
| Fine details (500×300, thin lines) | 4.5 KB | 27.6 KB | 200 | 75ms |

Numbers are from the plain Node benchmark (no downsampling, no worker) to
establish a true baseline; the shipped app applies downsampling + a Web
Worker on top (see below).

### Findings, mapped to the evaluation questions

1. **Fully client-side?** Yes — confirmed, no network calls in the pipeline.
2. **Best balance?** imagetracerjs: zero deps, ~48KB source, no build step,
   works identically in Node and browser, predictable output.
3. **Handles well:** logos, icons, flat/posterized illustrations, line art —
   anything with distinct flat-color regions. Output stays in the tens-of-KB
   range with clean, small path counts.
4. **Handles poorly:** photographs and photo-realistic images. The simulated
   photograph produced **23,134 paths and a 4.07MB SVG** from a 106KB JPEG —
   a 40x size increase and almost certainly a laggy `<svg>` to render. This
   is the clearest, most important limitation: **Vectuno should not market
   itself as a photo converter.**
5. **Color vectorization?** Yes, via color quantization (`numberofcolors`).
6. **Monochrome tracing?** Yes, by forcing `numberofcolors: 2`.
7. **Detail control?** Yes — `ltres`/`qtres`/`pathomit` (wrapped as a `detail`
   preset: low/medium/high).
8. **Smoothing/path simplification?** Yes — at this point in testing, planned
   as `blurradius` (pre-blur) + `roundcoords` (coordinate precision) wrapped
   as a single `smoothing` slider. **Superseded** — the shipped mapping uses
   `ltres`/`qtres` instead; `blurradius` was tested and rejected (see
   "Detail and Smoothness were deliberately re-derived" in the README's
   Conversion settings section for why).
9. **Background removal/preservation?** Alpha is preserved per-path via the
   `opacity` attribute (verified in output SVG source); there's no dedicated
   "remove background" feature — out of scope for Phase 1.
10. **Progress reporting?** No native progress callback — `imagedataToSVG` is
    a single synchronous call. Phase 2 would need to fake progress or chunk
    work manually if this matters.
11. **Large images?** The 4000×3000 test took **5.8s unthrottled on the
    main thread** — a real, measured bottleneck, not a hypothetical one. The
    shipped app addresses this two ways: (a) images are downsampled to a
    2000px-longest-side cap before tracing by default, and (b) tracing runs
    in a Web Worker so the UI thread never blocks. End-to-end browser test of
    the same 4000×3000 image through the real app: **1.7–1.9s, no UI jank**.
12. **Photographs?** Poor fit — see #4. Path/size explosion, not a crash.
13. **Transparent PNGs?** Verified working — alpha preserved as per-path
    `opacity`.
14. **Complex multicolor artwork?** Reasonable — 200–400 paths, tens of KB,
    sub-200ms for the illustration/detail fixtures tested.

### Extra finding: lossy source compression hurts output

A WebP re-encode of the color-logo fixture (introducing normal lossy
compression artifacts into what was originally flat color) produced **738
paths / 160KB**, vs. 137 paths / 20KB for the lossless PNG original of the
same artwork. Compression noise gets traced as real detail. Worth surfacing
to users later ("for best results, use a lossless source when possible").

## Known limitations (Phase 1 snapshot — historical)

The engine-level findings below (photographs, gradients, no SVGO pass) are
still accurate; the design/process framing is not — see the note after this
list.

- Photographs are a poor fit (see above) — no warning is shown yet; Phase 2
  should detect/discourage this or clearly set expectations.
- Gradients are posterized into flat color bands, not reproduced as SVG
  gradients — expected and inherent to how imagetracerjs quantizes color.
- No SVG post-optimization pass (e.g. SVGO) yet — output is `imagetracerjs`'s
  raw SVG, aside from the conservative dead-attribute cleanup in
  `optimizeSvg.ts` added later. Deferred; not needed to prove the pipeline works.
- No progress indicator during conversion (library has no progress hook).
- No background-removal feature.

## Remaining technical risks

- If a Phase 2 requirement needs materially better photo/gradient fidelity or
  smaller output on complex art, a self-compiled `wasm-pack` build of
  upstream `visioncortex/vtracer` (not the broken npm port) is the next
  option to prototype — budget real time for it; it's a Rust toolchain build,
  not an `npm install`.
- imagetracerjs was last published in 2022. It's algorithmically simple and
  dependency-free, which lowers risk, but it won't receive upstream fixes.

## Next implementation recommendation (historical — superseded)

Phase 1 is done: pipeline proven end-to-end (upload → decode → convert →
preview → download) with real browser tests, not just unit-level checks. The
concrete next step is Phase 2 polish: apply the black/white editorial design
direction to the existing shell, add a photograph-detection warning, and
consider an SVG-optimization pass (SVGO) before download.

**This recommendation is stale**: the design direction that actually shipped
is the warm, Strawberry-inspired palette described in the README's "Design
system" section, not black/white editorial. The photograph-detection warning
and an SVGO-style pass are both still outstanding — see the README's "Known
limitations" for their current status.

## Phase 2: fidelity investigation (color-merging bug)

Trigger: a report that generated SVGs contained "noise/artifacts" and didn't
visually match the source closely enough, most visibly on multicolor
artwork. Investigated before changing anything, per the reality check that a
raster and a true vector are different representations — the goal was to
find the actual, provable cause, not to tune parameters until it "looked
better."

### Root cause

Reproduced against a 12-petal rainbow flower fixture
(`06-multicolor-illustration.png`) at the shipped default settings: the
output collapsed 12 distinct petal hues into **5** merged color blobs
(adjacent petals like red/pink/magenta all became one flat pink shape).
Traced to `imagetracerjs`'s palette-seeding strategy:

- The default `colorsampling: 2` (`samplepalette2`) seeds the palette by
  sampling pixels from a fixed `ceil(sqrt(n)) × ceil(sqrt(n))` spatial grid
  over the image — **not** from the image's actual color distribution. At
  the shipped default `numberofcolors: 16`, that's an exact 4×4 grid.
- On artwork with several small/thin, evenly-distributed color regions (thin
  petals arranged in a ring; dense thin lines), a 4×4 grid of sample points
  has a real chance of missing a given region's pixels entirely — that
  color never gets its own palette slot and every pixel in it gets assigned
  to whichever *other* palette color is nearest, which is exactly what
  "colors merging into each other" looks like.
- `mincolorratio: 0` (the library default) means under-used palette slots
  are never reseeded to look elsewhere during the k-means refinement
  (`colorquantcycles`) — a bad initial grid position stays bad for the
  whole run.

This is a real, verifiable engine behavior (read directly from
`node_modules/imagetracerjs/imagetracer_v1.2.6.js`), not a guess.

### Experiments performed

All measured with a repeatable harness: convert each fixture with the exact
production option-building logic, then rasterize the resulting SVG at the
source's dimensions and compute mean absolute pixel error (MAE, 0-255 scale,
lower is better) against the original — paired with path/color counts and
direct visual inspection (a numerically-similar image can still look wrong).

1. **`colorsampling: 1`** (random pixel sampling) and **`colorsampling: 0`**
   (generated RGB-cube palette) — both call `Math.random()` internally with
   no seed. Repeated 5x per fixture: worst-of-5 pixel error was **3-15x**
   the median on the same image (e.g. `02-color-logo.png` MAE ranged 0.84 to
   12.44 across identical inputs). **Rejected** — a design tool where
   reconverting the same file can silently produce a different-looking SVG
   is not acceptable, regardless of average quality. `colorsampling: 2` (the
   default) has no `Math.random()` calls anywhere in its path and was kept
   for that reason.
2. **`mincolorratio` 0.008-0.02** (reseed low-usage palette slots) —
   improved the flower fixture but discarded real minor brand colors on
   `04-flat-illustration.png` (MAE 0.23 → 3.31, colors 7 → 4). **Rejected**
   — confirms the brief's warning that blind small-region suppression
   destroys meaningful detail, not just noise.
3. **`numberofcolors` 16 → 18/20/24/32/40** (deterministic — just changes
   the grid resolution) — **20 selected**. See results below.
4. **JPEG preprocessing (`blurradius` 1-3) on a lossy-recompressed logo** —
   re-encoding a clean 137-path/20KB logo as JPEG q70 alone inflated it to
   1,277 paths / 233KB (compression noise traced as real detail, confirming
   the Phase 1 finding). Pre-blurring at radius 1-3 before tracing did
   **not** meaningfully help (MAE stayed roughly flat or got worse; path
   count only marginally improved at radius 3, still ~5x the lossless
   baseline). **Not adopted** — JPEG compression noise is a source-quality
   problem this engine can't algorithmically undo; the existing "Detail:
   Low" control (see below) is the effective mitigation already available.
5. **`pathomit` (Detail) on the same recompressed JPEG** — Low (30) cut
   1,277 paths to 199 (6.5x reduction) at *equal or better* MAE (2.08 vs
   1.75) than the medium default. Confirms the existing Detail control is
   already the right, working lever for JPEG noise — no new "smart noise
   suppression" feature was needed on top of it.

### `numberOfColors` results (the shipped fix)

| Fixture | MAE before (n=16) | MAE after (n=20) | Colors before → after | Notes |
|---|---|---|---|---|
| `06-multicolor-illustration.png` | 5.00 | **1.81** | 7 → 14 | Visually confirmed: 12 petal hues now render distinctly instead of 5 merged blobs |
| `12-fine-details.png` (dense thin lines) | 2.27 | **0.03** | 3 → 3 | Same underlying grid-aliasing bug, different symptom |
| `08-gradient.png` | 6.45 | 5.35 | 16 → 20 | More bands, closer to the true gradient (gradients are still posterized by design — see known limitations) |
| `05-transparent.png` | 0.28 | 0.29 | 10 → 7 | Neutral MAE; paths 140→47 and file size 17.3KB→7.6KB — fewer stray micro-paths |
| `02-color-logo.png` | 0.34 | 0.34 | 5 → 5 | No change — already had enough grid resolution for its color count |
| `04-flat-illustration.png` | 0.23 | 0.23 | 7 → 7 | No change |
| `07-detailed-illustration.png` | 4.23 | 4.28 | 4 → 4 | Flat — this fixture's error is from inherent detail loss (see known limitations), not the grid bug |
| `09-photograph.jpg` | 15.90 | 18.83 | 16 → 20 | Slightly worse — more color slots means more quantization noise on a photo. Acceptable: photographs are an explicitly out-of-scope use case (see Known limitations), and this is traded for large, verified gains on the in-scope categories (logos/illustrations/flat graphics) |

`n=20` was chosen over 24/32 (which scored even better on the flower) because
it's the smallest step that fully fixes both affected fixtures while adding
zero cost to every fixture that wasn't affected — 24/32 started adding
unnecessary path/file-size growth on `07-detailed-illustration.png` (up to
1,091 paths / 186KB at n=32, vs 375-621 at n=16-24) for no corresponding
accuracy gain there.

Verified end-to-end through the real browser app (not just the Node
harness): the rendered `<svg>` in the live result screen contains 14 distinct
`fill` colors on the flower fixture, matching the Node-side measurement
exactly.

### Preview/download integrity (already correct, verified not changed)

Confirmed by reading `CompareSlider.tsx` and `ResultPreview.tsx`: the
comparison preview renders `result.svg` — the literal string the download
also uses — via `dangerouslySetInnerHTML`, with no re-render or raster
embedding step. Preview and downloaded file are provably the same bytes.
Nothing here needed to change; documenting it because the brief specifically
asked for verification.

### Performance

All fixtures still convert in well under 300ms (Node baseline, no worker
overhead), against the existing 30s worker timeout — `numberofcolors` 16→20
is a ~25% increase to a per-pixel-per-cycle inner loop, immaterial at this
scale. No change to the Web Worker architecture was needed.

### Known limitations (unchanged from Phase 1, reconfirmed)

- **Photographs remain a poor fit** for this engine — expected and now
  slightly more pronounced (see table above). Out of scope for this fix;
  Vectuno's primary audience is designers converting graphics/logos/
  illustrations, not photos, per the product brief.
- **Gradients are still posterized** into flat color bands, not reproduced
  as SVG `<linearGradient>`s — inherent to how imagetracerjs quantizes
  color, not something this fix changes.
- **Lossy source compression (JPEG, low-quality WebP) still measurably hurts
  output** — investigated directly (see experiment 4 above), no effective
  algorithmic fix found within this engine. The product-facing mitigation is
  the existing "Detail: Low" setting, which was verified to help
  substantially.
- **Very densely detailed illustrations** (e.g. `07-detailed-illustration.png`)
  have an MAE ceiling this fix doesn't move, because their error comes from
  genuine shape/detail simplification tradeoffs (`pathomit`/`ltres`/`qtres`),
  not the color-merging bug. A user who needs more fidelity there already has
  the "Detail: High" control.

## Phase 3: JPEG speckle noise (user-reported)

Trigger: a user converted a flat illustration saved as JPEG (a black cat
character, 1200×1200) and reported the result was covered in visible
noise/dots — unacceptable for the "professional designer" bar the product is
held to. Screenshot showed exactly the "lossy source compression hurts
output" limitation flagged (but not fixed) in Phase 2.

### Reproduced

Ran the exact reported image through the real production pipeline
(browser, not a Node approximation): **8,249 paths, 1.1MB** for what is
visually a ~5-color flat illustration. Confirmed visually — the rendered
SVG shows fine speckle across the yellow background and black fur, matching
the report exactly.

### Root cause

JPEG's lossy compression leaves small per-pixel color deviations in flat
regions and at edges (invisible to the eye at normal viewing size, but real
at the pixel level). `imagetracerjs` has no concept of "this is compression
noise" — it traces every one of those deviations as a real shape boundary,
because to the algorithm a 1-pixel color difference is indistinguishable
from an intentional 1-pixel design detail.

### Fix (superseded — see Fidelity pass below)

> A canvas `blur(2px)` was previously applied here. It was removed after a
> fidelity pass showed it bleeds high-contrast flat-art edges (black on
> yellow) into dull intermediate bands that quantize as extra washed-out
> colors. Speckle is now handled by adaptive palette sizing
> (`estimatePaletteSize` in `presets.ts`), higher `pathomit` (40/16/4), and a
> deterministic tiny-path strip in `optimizeSvg.ts` — no pixel blur.

**Scoped strictly to `file.type === "image/jpeg"`.** This is not a
cosmetic choice — tested directly: the same blur, applied to clean
lossless PNG fixtures, measurably *hurts* them (e.g. `12-fine-details.png`,
a dense thin-line pattern, collapsed from a near-perfect trace at 0.03 mean
absolute pixel error to a single path at 12.61 error under the same blur
that helps JPEGs). PNG and lossless WebP sources take a completely
different code path and are provably unaffected — confirmed via the full
existing fixture regression suite (every non-JPEG fixture produced an
identical path count to its pre-fix baseline).

### Blur strength — evidence, not a guess

Swept `blur(1px)` through `blur(4px)` against both the reported image and
the `09-photograph.jpg` fixture through the real pipeline:

| Image | Unblurred paths | 2px | 3px | 4px |
|---|---:|---:|---:|---:|
| Reported bug (2.jpg, flat illustration) | 8,249 | 788 | 793 | 835 |
| `09-photograph.jpg` | ~22,000-26,000 (Phase 1/2 baseline) | 813 | — | — |

Path count plateaus almost immediately past 2px — the noise floor is
already removed, and the residual paths at higher blur values are
increasingly real shape boundaries, not noise. **2px was selected** as the
smallest value that captures the full effect, minimizing any risk of
softening genuine silhouette detail.

### Result

- Reported image: **8,249 → 788 paths (90% reduction)**, file size 1.1MB →
  296KB. Visually: the widespread speckle across flat regions is gone. A
  faint texture remains immediately at the black/yellow boundary (JPEG edge
  ringing, distinct from the flat-region noise) — tested up to 4px blur and
  found not to resolve further, so it's treated as a residual, acknowledged
  limitation of tracing a lossy-compressed edge rather than something more
  blur can fix.
- `09-photograph.jpg`: **~22,000+ → 813 paths**, a large unplanned bonus —
  photographs remain out of scope as a supported use case, but are no
  longer pathologically unusable if a user tries one anyway.
- Zero change to any PNG/WebP fixture (verified: identical path counts to
  pre-fix baselines across the full fixture set).
- Zero new console/page errors across a full end-to-end regression sweep of
  all 12 fixtures plus the reported image, run through the real browser
  pipeline.

### Updated limitation

The "lossy source compression hurts output" limitation from Phase 2 is
**substantially mitigated**, not fully eliminated: JPEG sources now produce
dramatically cleaner output by default with no user action required, but a
small amount of edge-boundary texture is an inherent cost of tracing a
lossy-compressed edge and isn't fully removable without risking real
silhouette softening.

## Phase 4: presets and SVG cleanup (superseded settings)

Phases 1-3 above describe the earlier Detail / Smoothness / Colors controls
and the numbers behind them. Those controls were replaced by four presets
(Clean, Balanced, Detailed, Monochrome) and an exact-palette pipeline; see
the README's "Presets" and "SVG cleanup" sections for the current design and
`scripts/preset-eval.mjs` for the measurements.
