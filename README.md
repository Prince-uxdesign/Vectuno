# Vectuno — Image to Vector Converter

Client-side PNG/JPG/JPEG/WebP → SVG converter. The full journey is
implemented — upload → preview → configure → convert → compare result →
download — for both a single image and a multi-file batch, with a warm,
Strawberry-inspired design system. Everything runs in the browser: no auth,
no backend, no accounts, nothing uploaded to a server.

See [`docs/vectorization-evaluation.md`](docs/vectorization-evaluation.md)
for the engine evaluation (why `imagetracerjs`, why not `vtracer-wasm`) and
the underlying conversion-quality test results.

## Design system

A warm off-white system — ink instead of pure black, cream instead of pure
white, coral reserved as a punctuation accent rather than a UI-wide color —
plus spacing/radius/motion tokens, all defined once in `src/index.css` under
`:root`:

```
--ink / --canvas / --cream / --surface-white     text / page bg / card bg / elevated bg
--border-soft / --border-firm                    hairlines
--muted-warm / --coral / --coral-pressed / --error
--space-1 … --space-9        4px base scale
--radius-sm/md/lg            never pill-shaped
--duration-fast/base         collapsed to 0ms under prefers-reduced-motion
```

Reusable UI primitives live in `src/components/ui/` (`Button`, `Container`,
`Section`) plus `Logo`, `Navigation`, `Footer`, and `FileTypeHint` at the top
level. `Button` has real default/hover/focus-visible/active/disabled states.

## Stack

React + TypeScript + Vite. Vectorization via [`imagetracerjs`](https://github.com/jankovicsandras/imagetracerjs),
run inside a Web Worker so the UI thread never blocks. Zip packaging for
batch downloads via [`fflate`](https://github.com/101arrowz/fflate). No
backend, no database, no accounts.

## State model

Two parallel state machines, each an explicit `useReducer`, no scattered
booleans:

- **Single file** — `src/state/useConverter.ts`, driven by one `Stage`
  (`src/types/index.ts`):

  ```
  empty → dragActive → fileSelected → preparing → ready → converting → success
                                           ↓            ↑        ↓
                                         error ──────────┴────────┘
                                       (cancel returns converting → ready directly,
                                        not through error — see Cancellation below)
  ```

  `error` carries a `message`, `hint` (the actionable next step, e.g. "Try a
  smaller image"), and `recovery` (`"retry"` vs `"chooseNew"`) so the UI
  always offers the right next action.

- **Batch** — `src/state/useBatchConverter.ts`, an array of per-item states
  (`queued` / `converting` / `done` / `error`) processed one at a time (see
  "Batch conversion" below). The app renders one or the other: dropping 2+
  files switches the whole screen to the batch workspace; a single file uses
  the single-image flow above.

## Image input

Every way of getting an image in — the file picker, dropping on the upload
zone, dropping anywhere on the page, and pasting from the clipboard
(Cmd/Ctrl+V) — is normalized to plain `File` objects and enters one
pipeline: `validateFile` (type/size) → `decodeImage` (byte-signature check,
decode, dimensions, transparency) → preview → the normal conversion flow.

- **Paste** (`state/useImageIntake.ts`, `lib/input/clipboard.ts`): uses the
  standard `paste` event, which needs no clipboard permission prompt.
  Pasted images get a name like `pasted-image-20260923-101530.png`. Pasting
  something that isn't an image shows a quiet notice; the normal upload
  controls are unaffected.
- **Validation**: the real format is identified from the file's leading
  bytes (`lib/image/sniff.ts`), not its name or declared MIME, so a JPEG
  saved as `.png` is reported as JPEG and a renamed text file is rejected.
- **Info**: filename plus one quiet line (`PNG · 1200 × 800 · 248 KB`), and
  "Transparency detected" only when a decoded pixel is actually non-opaque.
- **Preview background** (`BackgroundToggle`): Checker / White / Black,
  shown only for images with transparency. It is CSS on the preview frame
  only; the source pixels and generated SVG are never touched.
- **Change image / Convert another image** return to a fresh upload state,
  including default conversion settings.

## Presets

The normal flow is **choose a preset → Convert**. Each preset is a full engine
configuration (`src/lib/engine/presets.ts`), not a label; the UI only shows
its name and a one-line description.

| Preset | For | What it changes |
|---|---|---|
| **Clean** | Logos, icons, simple graphics | ≤ 8 fills (a fill needs ≥ 0.5% of the image to count), near-colors merged (RGB distance 40), one pass of 3×3 edge smoothing, curve fit tolerance 1.5 (fewest nodes), tiny paths under ~1% of the image dropped |
| **Balanced** *(default)* | Most images | ≤ 20 fills (≥ 0.3%), merge distance 28, curve fit 0.6, edge tolerance 36 |
| **Detailed** | Complex illustration | ≤ 32 fills (≥ 0.2%), merge distance 24, curve fit 0.3, keeps finer shapes |
| **Monochrome** | B/W logos, icons, line art | Otsu-thresholds the image to ink/background (border decides which is which), traces two colors, and emits **one black compound path** with true transparent holes |

**Advanced → Colors** fixes the palette size (2–64) instead of letting the
preset choose ("Auto"); it is hidden for Monochrome.

How the color presets work: the image's real fills are found first (exact
most-common colors, not averages), pixels are snapped to them — in-between
anti-aliased/JPEG blends resolve to whichever neighbor they resemble rather
than to a third color — and the tracer is handed that exact palette. Images
that don't reduce to a small palette (gradients, photographs) skip the
snapping and are traced from the original pixels.

## SVG cleanup

`lib/engine/optimizeSvg.ts` runs inside the worker after tracing. Every step
was measured by rendering original raster → tracer output → cleaned SVG in
Chromium (`npm run test:cleanup`, `npm run test:presets`).

Kept:

- **Lossless hygiene** — viewBox, metadata, zero-opacity paths, `opacity`
  rounding to 3 decimals, dead zero-width strokes, `rgb()` → hex. Renders
  pixel-identically to the tracer's output on all 24 test images (0.0000 MAE),
  5–54% smaller.
- **Shape stacking** — the tracer emits "tiles with cut-out holes", which
  leaves hairline seams between neighbors. Painting shapes largest-first
  without the duplicate holes removes the seams without fattening anything,
  and is 25–28% smaller. It improves fidelity on average and never made an
  image worse by more than 0.05 MAE. Only used for fully opaque art; holes no
  other shape fills are kept.
- **Speckle removal** — flat art only, per subpath, so a removed dot's hole is
  filled by its parent. Cuts paths 35% on Balanced for −0.012 MAE.

Rejected (measured, then removed):

- **Crack sealing by hairline strokes** (the previous approach): fattened every
  shape — MAE on a two-color logo went 0.13 → 0.63 and on hairline art
  0.04 → 6.96. Replaced by stacking.
- **Merging near-duplicate fills, snapping the background to the dominant
  color, dropping duplicate paths**: exactly zero effect once fills come from
  an exact palette; on photographs the background snap made results worse.
  Deleted rather than kept as dead code.
- **Speckle removal on photographs/gradients**: it deletes real image content
  (worse fidelity), so it only runs on flat art.

## Batch conversion

Dropping or picking more than one file switches to `BatchWorkspace`
(`src/state/useBatchConverter.ts`, `src/components/BatchWorkspace.tsx`):
queue, remove-while-queued, one shared settings panel, sequential
processing (bounded memory — one decoded image at a time regardless of
batch size), per-item download, and a "Download all as .zip" once at least
one item finishes. Options are snapshotted at the moment "Start" is
pressed, so changing a setting mid-run can't produce a batch with mixed
settings.

## Processing state & cancellation

`imagetracerjs`'s `imagedataToSVG` is a single synchronous call with no
internal yield points or progress hook — so only two stages are real and
honestly reportable: **"Preparing image"** (decode) and **"Vectorizing your
image"** (the worker call). No fabricated intermediate stages.

Cancellation is real, not cosmetic: each conversion runs in its own
freshly-created Worker (see `vectorizeClient.ts`), so cancelling just calls
`AbortController.abort()`, which terminates that worker outright. Cancelling
returns straight to `ready` (not `error`) — it isn't a failure.

## Other conversion-result features

- **Compare slider** (`CompareSlider`) — drag to reveal original vs.
  vectorized result side by side, with Original/Split/Vector shortcuts.
- **Zoom** (`ResultZoomControls`) — Fit plus 100%/200%/400% presets render at
  multiples of the natural pixel size inside a scrollable viewport, so close
  inspection never breaks the page layout.
- **Preview background** (`BackgroundToggle`) — Checker/White/Black backdrop,
  preview-only, never baked into the SVG.
- **SVG code view** (`SvgCodeViewer`) — Preview/SVG Code tabs with formatted,
  scrollable markup of the exact file being downloaded.
- **Detected palette** (`SvgPalette` / `lib/svg/inspect.ts`) — fills parsed
  from the generated SVG, most-used first, with Copy palette.
- **Copy SVG to clipboard** (`CopySvgButton` + `lib/utils/clipboard.ts`)
  alongside the download button.
- **Open SVG** (`OpenSvgButton`) — the genuine SVG in a new tab, with a
  recovery message if a popup blocker stops it.
- **Figma handoff** (`FigmaHandoff`) — Copy SVG for Figma plus paste guidance
  (no fake deep link; the browser can't force-launch the desktop app).
- **Quality guidance** (`QualityNotice` / `lib/image/quality.ts`) — a calm,
  non-blocking notice when the source looks photographic/complex or very
  small; the same signal adds preset suggestions ("Try Clean mode") to a
  failed conversion's recovery actions.
- **Raster export** (`RasterExportButtons` / `lib/utils/rasterExport.ts`) —
  export the result as PNG or JPEG, rendered from the SVG on a canvas
  (capped at 4096px per side, 2x source resolution).
- **SVG post-processing** (`lib/engine/optimizeSvg.ts`) — adds a `viewBox`
  (imagetracerjs emits only `width`/`height`), strips inert
  metadata/zero-width-stroke/`opacity="1"` attributes. Conservative on
  purpose: no path simplification or coordinate rounding beyond what
  imagetracerjs already applies.

## Project structure

```
src/
  types/            Stage, AppError (+ ErrorRecovery), ConversionOptions, etc.
  lib/
    image/          validate.ts (MIME + extension fallback + size),
                     decode.ts (createImageBitmap → canvas → downsample, dimension check),
                     sniff.ts (magic-number type detection), transparency.ts,
                     quality.ts (photo-like / tiny guidance signals)
    engine/         presets.ts (options → imagetracerjs config), vectorize.worker.ts,
                     vectorizeClient.ts (worker wrapper w/ timeout + typed errors),
                     optimizeSvg.ts (viewBox + dead-attribute cleanup)
    input/          paste.ts (clipboard DataTransfer → Files)
    svg/            inspect.ts (palette extraction + markup formatting)
    utils/          filename.ts, download.ts, rasterExport.ts, zip.ts, format.ts,
                     clipboard.ts (copy-to-clipboard with fallback)
  state/            useConverter.ts (single file), useBatchConverter.ts (batch),
                     useRotatingFact.ts (ConversionLoader fact rotation)
  components/
    ui/                 Button, Container, Section — the shared primitives
    Navigation, Footer, Logo    sticky header; nav links collapse to Logo+CTA
                        <640px, with footer nav links as the mobile fallback
    BackgroundToggle    preview-only Checker/White/Black backdrop control
    HowItWorks          3-step landing content, also the #how-it-works nav target
    UploadZone          click / drag-drop / mobile picker; distinguishes a
                        valid vs. unsupported drag (icon + text, not color alone)
    FilePreview           contained thumbnail + "Change image"
    FileMetadata           name / type / size / dimensions
    PresetPicker           Clean / Balanced / Detailed / Monochrome radio cards
    ConversionSettings     preset picker + collapsed Advanced (Colors)
    ConversionStatus       headline+subtext status, Convert trigger
    ConversionLoader       dedicated "converting" screen with rotating facts
    ResultPreview           workspace: tabs, zoom, CompareSlider, background,
                            actions, technical details, palette, Figma handoff
    ResultMetadata          format / dimensions / file size / paths / colors
    ResultZoomControls      Fit + 100/200/400% zoom stepper and presets
    SvgCodeViewer           formatted, scrollable SVG markup + copy
    SvgPalette              detected-colors swatches + Copy palette
    DownloadButton, CopySvgButton, OpenSvgButton, FigmaHandoff,
    RasterExportButtons
    QualityNotice           calm photo-like / tiny-source guidance (non-blocking)
    BatchWorkspace          queue, per-item status/download, zip-all
    ErrorState              icon + message + hint + recovery-appropriate action(s),
                            plus contextual preset suggestions on complex-image failures
    RootErrorBoundary       last-resort render-error fallback (see src/main.tsx)
  App.tsx           Composes single-file vs. batch vs. landing off both hooks' state
scripts/            Test fixture generation, benchmark, e2e/visual probes
docs/               Technical evaluation
test/fixtures/      Synthetic test images (generated, checked in — tiny)
```

## Setup

```
npm install
npm run dev
```

## Testing

```
npm run test:fixtures       # regenerate test/fixtures/*.png|jpg|webp (15 fixtures,
                             # including a webp source, a corrupted file, and an
                             # oversized-dimensions file for error-path coverage)
npm run test:benchmark      # run imagetracerjs against all fixtures, print size/paths/time
npm run test:e2e            # single-file user-journey suite: upload, convert, cancel,
                             # errors, settings changes, keyboard/touch, breakpoints
npm run test:e2e-input      # picker, drag-and-drop, clipboard paste, validation,
                             # transparency/background preview, reset flows, and
                             # overflow/touch-target checks from 320px to 1920px
npm run test:e2e-batch      # batch-specific journey: multi-file queue, remove, zip
npm run test:e2e-stress     # forced-failure / flaky-worker resilience checks
npm run test:visual         # screenshots + real DataTransfer drag events,
                             # long-filename overflow, disabled-state checks
npm run test:design         # full-page landing screenshots at all required breakpoints
npm run test:responsive     # computed-style responsive audit across breakpoints
npm run test:responsive-shots
```

`test:e2e*`, `test:visual`, `test:design`, and `test:responsive*` all require
the dev server running separately first:

```
npx vite --port 5185
```

All of the above run against a real, unmodified build of the app in actual
Chromium. Playwright is a devDependency only — it never ships in the app
bundle.

## A TypeScript gotcha worth knowing about

`npx tsc --noEmit` silently checks **nothing** in this repo — the root
`tsconfig.json` has `"files": []` and delegates to `tsconfig.app.json` /
`tsconfig.node.json` via project references, which plain `tsc` doesn't
follow. It exits 0 even with real type errors sitting in modified files.
Use `npx tsc -b --noEmit` (build mode, follows references) or just
`npm run build` — never bare `tsc --noEmit` — when verifying this project
actually typechecks.

## Known limitations

See "Known limitations" and "Remaining technical risks" in
[`docs/vectorization-evaluation.md`](docs/vectorization-evaluation.md) for
engine-level limits (photographs are a poor fit, gradients get posterized).

Product-level, as of this phase:

- No SVG post-optimization pass beyond `optimizeSvg.ts`'s conservative
  cleanup (e.g. no SVGO-style path simplification).
- No true progress percentage or intermediate stages during conversion — the
  engine has no progress hook, so the UI shows two honest stages (Preparing /
  Vectorizing) with an indeterminate spinner.
- No Background Keep/Remove setting — `imagetracerjs` has no background
  detection/removal capability to map; see "Conversion settings" above.
- Photographic sources get an expectation-setting notice (and preset
  suggestions if conversion fails), but nothing is blocked — a photograph
  will still trace, often into a very large SVG.
- "How it works" and "About" are anchors on the same page, not separate
  routes. The header nav collapses to Logo + "Start converting" below 640px;
  the footer carries the same two links as a mobile-only fallback.
