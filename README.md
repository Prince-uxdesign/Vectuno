# Vectuno — Image to Vector Converter

Client-side PNG/JPG/JPEG/WebP → SVG converter. The full core conversion
journey is implemented: upload → preview → configure → convert → preview
result → download. No landing page polish, no auth, no backend, no accounts.

See [`docs/vectorization-evaluation.md`](docs/vectorization-evaluation.md)
for the engine evaluation (why `imagetracerjs`, why not `vtracer-wasm`) and
the underlying conversion-quality test results.

## Stack

React + TypeScript + Vite. Vectorization via [`imagetracerjs`](https://github.com/jankovicsandras/imagetracerjs),
run inside a Web Worker so the UI thread never blocks. No backend, no
database, no accounts.

## State model

The whole app is driven by one explicit `Stage` (`src/types/index.ts`),
managed with `useReducer` in `src/state/useConverter.ts` — no scattered
booleans:

```
empty → dragActive → fileSelected → preparing → ready → converting → success
                                         ↓            ↑        ↓
                                       error ──────────┴────────┘
```

`error` carries a `recovery` hint (`"retry"` vs `"chooseNew"`) so the UI
always offers the right next action: a conversion failure keeps the file and
settings on screen with a "Try again" button; an upload/validation failure
shows "Choose a different image" since the file itself is the problem.

## Project structure

```
src/
  types/            Stage, AppError (+ ErrorRecovery), ConversionOptions, etc.
  lib/
    image/          validate.ts (MIME + extension fallback + size),
                     decode.ts (createImageBitmap → canvas → downsample, dimension check)
    engine/         presets.ts (options → imagetracerjs config), vectorize.worker.ts,
                     vectorizeClient.ts (worker wrapper w/ timeout + typed errors)
    utils/          filename.ts (download filename derivation + sanitization)
  state/            useConverter.ts — the whole pipeline as one reducer
  components/
    UploadZone           click / drag-drop / mobile picker, reports drag state up
    FilePreview           contained thumbnail + "Change image"
    FileMetadata           name / type / size / dimensions
    ConversionSettings     color mode, colors, detail, smoothing (all real, all wired)
    ConversionStatus       status text + the Convert trigger
    ResultPreview           original + SVG side-by-side + SVG stats
    DownloadButton          derives "name.svg" from the source filename
    ErrorState              message + recovery-appropriate action(s)
  App.tsx           Composes everything off `state.stage`
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
npm run test:fixtures    # regenerate test/fixtures/*.png|jpg|webp (12 categories)
npm run test:benchmark   # run imagetracerjs against all fixtures, print size/paths/time
npm run test:e2e         # Phase 1 smoke test (Playwright)
npm run test:e2e-full    # full user-journey suite: 129 assertions across 7 image
                         # types, 9 breakpoints, keyboard/touch, rejection/corruption/
                         # timeout errors, replace-image, sequential conversions
npm run test:visual      # screenshots + real DataTransfer drag events,
                         # long-filename overflow, disabled-state checks
```

`test:e2e`, `test:e2e-full`, and `test:visual` all require the dev server
running separately first:

```
npx vite --port 5185
```

All of the above run against a real, unmodified build of the app in actual
Chromium — nothing is mocked except the one deliberately-forced-failure case
in `e2e-full.mjs`, which overrides `Worker.postMessage` to verify the error
UI without needing to organically break a working vectorizer.

Playwright is a devDependency only — it never ships in the app bundle.

## Known limitations

See "Known limitations" and "Remaining technical risks" in
[`docs/vectorization-evaluation.md`](docs/vectorization-evaluation.md) for
engine-level limits (photographs are a poor fit, gradients get posterized).

Product-level, as of this phase:

- No SVG post-optimization pass (e.g. SVGO) — output is `imagetracerjs`'s raw
  SVG.
- No true progress percentage during conversion — the engine has no progress
  hook, so `ConversionStatus` shows an honest indeterminate spinner rather
  than a fabricated percentage.
- No batch/multi-file upload — one image at a time, by design for this phase.
