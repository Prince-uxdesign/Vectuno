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
                                     (cancel returns converting → ready directly,
                                      not through error — see Cancellation below)
```

`error` carries a `message`, `hint` (the actionable next step, e.g. "Try a
smaller image"), and `recovery` (`"retry"` vs `"chooseNew"`) so the UI always
offers the right next action: a conversion failure keeps the file and
settings on screen with a "Try again" button; an upload/validation failure
shows "Choose a different image" since the file itself is the problem.

## Conversion settings

Three core settings, mapped to `imagetracerjs` parameters that were verified
— not assumed — to actually change output (`npm run test:settings`):

| Setting | User sees | Engine parameter | Verified effect |
|---|---|---|---|
| Mode | Color / Monochrome | `numberofcolors` (2 vs. user value) | obvious |
| Detail | Low / Medium / High | `pathomit` (30 / 8 / 1) | path count only — which shapes survive |
| Smoothness | Low / Medium / High | `ltres`/`qtres` (0.2 / 1 / 4) | file size only, same path count — curve simplification |

Detail and Smoothness were deliberately re-derived this phase after testing
showed the original mapping was wrong: `pathomit` and `ltres`/`qtres` were
both lumped under "Detail," and a candidate "Smoothness" built on
`blurradius` actually *increased* path count on flat art (pre-blur
anti-aliasing gets quantized into extra color bands) — the opposite of what
"smoothness" should do. Blurring was cut entirely rather than shipped as a
control that sometimes makes output worse. The current mapping keeps Detail
and Smoothness independent: Detail changes *what* gets traced, Smoothness
changes *how* the curves are fit, and `scripts/benchmark-settings.mjs`
asserts that relationship holds (monotonic path count for Detail, monotonic
size for Smoothness) on every run.

**Advanced** (collapsed `<details>`, Color mode only): a 2–64 "Colors" slider
(`numberofcolors` directly). This is the one continuous/technical control
still exposed — kept out of the core three because the brief's settings list
doesn't include it, but it's real and worth keeping for users who want finer
control than three color-mode-adjacent buckets.

**Not implemented: Background Keep/Remove.** `imagetracerjs` has no
background-detection or removal capability — it traces whatever pixels are
there, preserving existing alpha as per-path opacity. Building real
background removal would mean writing new segmentation logic, not mapping an
existing engine parameter, which is out of scope for "map the engine's
parameters to friendly controls." Skipped per "only expose settings that
genuinely work," not shipped as a no-op toggle.

**Defaults:** Mode=Color, Detail=Medium, Smoothness=Medium, Colors=16 —
tested to work well across the fixture set without any adjustment.

## Processing state & cancellation

`imagetracerjs`'s `imagedataToSVG` is a single synchronous call with no
internal yield points or progress hook (confirmed in the Phase 1 engine
evaluation) — so only two stages are real and honestly reportable:
**"Preparing image"** (decode) and **"Vectorizing your image"** (the worker
call). Fabricated intermediate stages ("Analyzing," "Tracing," "Optimizing")
were deliberately not added — there's no way to know which is actually
happening inside an opaque synchronous call.

Cancellation is real, not cosmetic: each conversion runs in its own
freshly-created Worker (see `vectorizeClient.ts`), so cancelling just calls
`AbortController.abort()`, which terminates that worker outright. Since
nothing is shared between conversions, terminating mid-run can't corrupt
state — the same mechanism the 30s timeout already used. Cancelling returns
straight to `ready` (not `error`): it isn't a failure.

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
    ConversionSettings     Mode/Detail/Smoothness (segmented, checkmark + bold
                           on selection, not color alone) + collapsed Advanced
    ConversionStatus       headline+subtext status, Convert trigger, Cancel
                           button while converting
    ResultPreview           original + SVG side-by-side + SVG stats
    DownloadButton          derives "name.svg" from the source filename
    ErrorState              icon + message + hint (what happened / what to do)
                           + recovery-appropriate action(s)
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
npm run test:settings    # verify Detail/Smoothness are monotonic on real fixtures
                         # (fails the build if a future preset change breaks that)
npm run test:e2e         # full user-journey suite: 143 assertions across 7 image
                         # types, 9 breakpoints, keyboard/touch, rejection/corruption/
                         # timeout errors, replace-image, sequential conversions,
                         # settings-changes-output, Advanced disclosure, cancellation,
                         # no-accidental-auto-convert
npm run test:visual      # screenshots + real DataTransfer drag events,
                         # long-filename overflow, disabled-state checks
npm run test:design      # full-page landing screenshots at all 10 required
                         # breakpoints (320–1920px)
```

`test:e2e`, `test:visual`, and `test:design` all require the dev server
running separately first:

```
npx vite --port 5185
```

All of the above run against a real, unmodified build of the app in actual
Chromium — nothing is mocked except two deliberately-forced conditions in
`e2e-full.mjs`: a `Worker.postMessage` override to verify the error UI
without needing to organically break a working vectorizer, and a delayed
`postMessage` to open a real window to cancel in.

Playwright is a devDependency only — it never ships in the app bundle.

## A TypeScript gotcha worth knowing about

`npx tsc --noEmit` silently checks **nothing** in this repo — the root
`tsconfig.json` has `"files": []` and delegates to `tsconfig.app.json` /
`tsconfig.node.json` via project references, which plain `tsc` doesn't
follow. It exits 0 even with real type errors sitting in modified files.
Caught this the hard way mid-phase: a type error survived several
`tsc --noEmit` "clean" checks in a row. Use `npx tsc -b --noEmit` (build
mode, follows references) or just `npm run build` — never bare
`tsc --noEmit` — when verifying this project actually typechecks.

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
- No true progress percentage or intermediate stages during conversion — the
  engine has no progress hook, so `ConversionStatus` shows two honest stages
  (Preparing / Vectorizing) with an indeterminate spinner, not a fabricated
  percentage or made-up steps like "Analyzing" / "Optimizing."
- No batch/multi-file upload — one image at a time, by design for this phase.
- No Background Keep/Remove setting — `imagetracerjs` has no background
  detection/removal capability to map; see "Conversion settings" above.
- "How it works" and "About" are anchors on the same page, not separate
  routes — intentional, since this isn't a multi-page product. Nav collapses
  to just Logo + "Start converting" below 640px rather than adding a
  hamburger menu for two links.
