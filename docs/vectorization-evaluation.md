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
8. **Smoothing/path simplification?** Yes — `blurradius` (pre-blur) +
   `roundcoords` (coordinate precision), wrapped as a single `smoothing` slider.
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

## Known limitations (current MVP)

- Photographs are a poor fit (see above) — no warning is shown yet; Phase 2
  should detect/discourage this or clearly set expectations.
- Gradients are posterized into flat color bands, not reproduced as SVG
  gradients — expected and inherent to how imagetracerjs quantizes color.
- No SVG post-optimization pass (e.g. SVGO) yet — output is `imagetracerjs`'s
  raw SVG. Deferred; not needed to prove the pipeline works.
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

## Next implementation recommendation

Phase 1 is done: pipeline proven end-to-end (upload → decode → convert →
preview → download) with real browser tests, not just unit-level checks. The
concrete next step is Phase 2 polish: apply the black/white editorial design
direction to the existing shell, add a photograph-detection warning, and
consider an SVG-optimization pass (SVGO) before download.
