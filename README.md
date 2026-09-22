# Vectuno — Image to Vector Converter

Client-side PNG/JPG/JPEG/WebP → SVG converter. Phase 1: technical foundation
only (no landing page polish, no auth, no backend). See
[`docs/vectorization-evaluation.md`](docs/vectorization-evaluation.md) for the
full engine evaluation and test results.

## Stack

React + TypeScript + Vite. Vectorization via [`imagetracerjs`](https://github.com/jankovicsandras/imagetracerjs),
run inside a Web Worker. No backend, no database, no accounts.

## Project structure

```
src/
  types/            Shared types + AppError
  lib/
    image/          validate.ts, decode.ts (createImageBitmap → canvas → downsample)
    engine/         presets.ts (options → imagetracerjs config), vectorize.worker.ts,
                     vectorizeClient.ts (worker wrapper w/ timeout + typed errors)
  state/            useConverter.ts — the upload/convert pipeline as one hook
  components/       UploadZone, ControlsPanel, PreviewPanel
  App.tsx           Composition + download handler
scripts/            Test fixture generation, benchmark, e2e probe (see below)
docs/               Technical evaluation
test/fixtures/      Synthetic test images (generated, checked in — tiny)
```

## Setup

```
npm install
npm run dev
```

## Testing

Three repeatable scripts back the technical evaluation:

```
npm run test:fixtures   # regenerate test/fixtures/*.png|jpg|webp (12 categories)
npm run test:benchmark  # run imagetracerjs against all fixtures, print size/paths/time
npm run test:e2e        # real-browser test (Playwright): requires `npx vite --port 5184` running separately
node scripts/responsive-probe.mjs  # checks 320–1920px breakpoints for horizontal scroll (same port requirement)
```

`test:e2e` drives the actual app in Chromium and verifies: PNG/JPG/WebP all
load, SVG is generated and renders, download works, transparent PNGs work,
large images downsample and still succeed, and unsupported/corrupted/
oversized files fail with a user-facing message (not a stack trace).

Playwright is a devDependency only — it never ships in the app bundle.

## Known limitations

See "Known limitations" and "Remaining technical risks" in
[`docs/vectorization-evaluation.md`](docs/vectorization-evaluation.md). Short
version: photographs are a poor fit (huge path counts), gradients get
posterized, there's no SVG optimization pass yet, and there's no conversion
progress indicator.
