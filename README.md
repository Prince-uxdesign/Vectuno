# Vectuno — Image to Vector Converter

Client-side PNG/JPG/JPEG/WebP → SVG converter. The full core conversion
journey is implemented — upload → preview → configure → convert → preview
result → download — with a polished, black-and-white, editorial design
system and a real landing/upload experience. No auth, no backend, no
accounts.

See [`docs/vectorization-evaluation.md`](docs/vectorization-evaluation.md)
for the engine evaluation (why `imagetracerjs`, why not `vtracer-wasm`) and
the underlying conversion-quality test results.

## Design system

Strict black/white + a 4-step neutral gray scale, spacing/radius/motion
tokens, all defined once in `src/index.css` under `:root`:

```
--black / --white
--gray-100 (very light) / --gray-300 (light) / --gray-500 (medium) / --gray-700 (dark)
--space-1 … --space-9        4px base scale
--radius-sm/md/lg            4/8/12px — never pill-shaped
--duration-fast/base         120/200ms, cubic-bezier(0.4,0,0.2,1)
                              collapsed to 0ms under prefers-reduced-motion
```

Reusable UI primitives live in `src/components/ui/` (`Button`, `Container`,
`Section`) plus `Logo`, `Navigation`, and `FileTypeHint` at the top level.
`Button` has real default/hover/focus-visible/active/disabled states — see
"A cascade bug worth knowing about" below for a real mistake this caught.

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
    ui/                 Button, Container, Section — the shared primitives
    Navigation, Logo    sticky header; nav links collapse to Logo+CTA <640px
                        (no hamburger — see design notes)
    HowItWorks          3-step landing content, also the #how-it-works nav target
    UploadZone          click / drag-drop / mobile picker; distinguishes a
                        valid vs. unsupported drag (icon + text, not color alone)
    FilePreview           contained thumbnail + "Change image"
    FileMetadata           name / type / size / dimensions
    ConversionSettings     color mode, colors, detail, smoothing (all real, all wired)
    ConversionStatus       status text + the Convert trigger
    ResultPreview           original + SVG side-by-side + SVG stats
    DownloadButton          derives "name.svg" from the source filename
    ErrorState              icon + message + recovery-appropriate action(s)
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
npm run test:design      # full-page landing screenshots at all 10 required
                         # breakpoints (320–1920px)
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

## A cascade bug worth knowing about

The base `.btn` class originally hard-coded `flex: 1; min-width: 140px` (it
needs to grow when two buttons sit side-by-side in `.workspace__actions`).
When `Button` was reused for the nav's "Start converting" CTA, that rule
made it stretch to fill the entire header — found by actually looking at a
screenshot, not assumed away. The real fix wasn't a specificity hack: `flex:
1` moved out of `.btn` entirely and onto `.workspace__actions .btn` /
`.error-state__actions .btn`, since growing-to-fill is the parent layout's
decision, not an intrinsic property of a button. Worth remembering when
adding new `Button` usages outside those two containers.

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
- "How it works" and "About" are anchors on the same page, not separate
  routes — intentional, since this isn't a multi-page product. Nav collapses
  to just Logo + "Start converting" below 640px rather than adding a
  hamburger menu for two links.
