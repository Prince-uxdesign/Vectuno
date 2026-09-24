import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigation } from "./components/Navigation";
import { UploadZone } from "./components/UploadZone";
import { HowItWorks } from "./components/HowItWorks";
import { ImageShowcase } from "./components/ImageShowcase";
import { Footer } from "./components/Footer";
import { FilePreview } from "./components/FilePreview";
import { FileMetadata } from "./components/FileMetadata";
import { QualityNotice } from "./components/QualityNotice";
import { ConversionSettings } from "./components/ConversionSettings";
import { ConversionStatus } from "./components/ConversionStatus";
import { ConversionLoader } from "./components/ConversionLoader";
import { ResultPreview } from "./components/ResultPreview";
import { ErrorState } from "./components/ErrorState";
import { BatchWorkspace } from "./components/BatchWorkspace";
import { Container } from "./components/ui/Container";
import { Section } from "./components/ui/Section";
import { Button } from "./components/ui/Button";
import { PwaInstallModal } from "./components/PwaInstallModal";
import { useConverter } from "./state/useConverter";
import { useBatchConverter } from "./state/useBatchConverter";
import { useImageIntake, type IntakeSource } from "./state/useImageIntake";
import { usePwaInstall } from "./lib/usePwaInstall";
import { analyzeQuality } from "./lib/image/quality";
import { PRESETS } from "./lib/engine/presets";
import type { PreviewBackground, PresetId } from "./types";

const FALLBACK_ERROR_MESSAGE = "Something unexpected happened.";
const FALLBACK_ERROR_HINT = "Try again, or choose a different image.";
const DEFAULT_PREVIEW_BACKGROUND: PreviewBackground = "checker";
const NOTICE_MS = 6000;

function App() {
  const { state, loadFile, setOptions, convert, cancel, reset, setDragActive } = useConverter();
  const batch = useBatchConverter();
  const pwa = usePwaInstall();
  const [rejectedCount, setRejectedCount] = useState(0);
  const [previewBackground, setPreviewBackground] = useState<PreviewBackground>(DEFAULT_PREVIEW_BACKGROUND);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const uploadZoneRef = useRef<HTMLButtonElement>(null);
  const workspaceHeadingRef = useRef<HTMLHeadingElement>(null);
  const convertingHeadingRef = useRef<HTMLHeadingElement>(null);
  // Set when a nav click needs a reset first (workspace/converting/result/
  // batch screens unmount the landing sections a scroll target lives in).
  // Consumed by the landing-transition effect below, once the target
  // sections are actually back in the DOM, instead of guessing with a bare
  // requestAnimationFrame after reset().
  const pendingScrollRef = useRef<{ id: string; focusUpload: boolean } | null>(null);

  const isBatchActive = batch.state.items.length > 0;
  const isLanding = !isBatchActive && (state.stage === "empty" || state.stage === "dragActive");
  // A conversion (not upload) failure keeps the file context on screen —
  // the file is fine, only the last convert attempt failed — so the user
  // can retry without re-selecting anything. An upload/decode failure means
  // the file itself was rejected, so no file context exists to show.
  const isRetryableError = state.stage === "error" && state.errorRecovery === "retry";
  // "converting" gets its own dedicated screen (see ConversionLoader) rather
  // than living inside the settings workspace — the progress pill and fact
  // rotation are the visual centerpiece while a conversion is running, not
  // one panel among several.
  const showWorkspace =
    !isBatchActive &&
    (state.stage === "fileSelected" || state.stage === "preparing" || state.stage === "ready" || isRetryableError);
  const showConverting = !isBatchActive && state.stage === "converting";
  const showResult = !isBatchActive && state.stage === "success";
  const showError = !isBatchActive && state.stage === "error";

  // Expectation-setting guidance derived from the decoded pixels (sampled,
  // memoized — no re-scan per render). Null until an image is decoded.
  const quality = useMemo(() => {
    if (!state.decoded) return null;
    return analyzeQuality(
      state.decoded.imageData.data,
      state.decoded.imageData.width,
      state.decoded.imageData.height,
      state.decoded.originalWidth,
      state.decoded.originalHeight
    );
  }, [state.decoded]);

  // A failed conversion of photographic/complex artwork genuinely converts
  // better under a simpler preset — so offer exactly that, instead of only
  // "try the same thing again". The current preset is excluded; the image
  // and all other settings are preserved, and selecting one retries
  // immediately. Shown only when complexity was actually detected.
  const retrySuggestions = useMemo(() => {
    if (!isRetryableError || !quality?.photoLike) return undefined;
    const fallbacks: PresetId[] = ["clean", "balanced", "monochrome"];
    return fallbacks
      .filter((preset) => preset !== state.options.preset)
      .slice(0, 2)
      .map((preset) => ({
        label: `Try ${PRESETS[preset].label} mode`,
        onSelect: () => {
          setOptions({ preset });
          convert();
        },
      }));
  }, [isRetryableError, quality, state.options.preset, setOptions, convert]);

  const retryExtraHint = isRetryableError && quality?.photoLike
    ? "This image contains a large amount of photographic detail. Vectuno works best with logos, icons and illustrations."
    : null;

  const showNotice = useCallback((message: string) => {
    clearTimeout(noticeTimerRef.current);
    setNotice(message);
    noticeTimerRef.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  useEffect(() => () => clearTimeout(noticeTimerRef.current), []);

  const handleAddToBatch = useCallback(
    (files: File[]) => {
      const { rejected } = batch.addFiles(files);
      setRejectedCount(rejected);
    },
    [batch]
  );

  const handleBatchReset = useCallback(() => {
    setRejectedCount(0);
    batch.reset();
  }, [batch]);

  // "Change image" / "Convert another image": back to a fresh upload state —
  // image, result, errors, conversion settings and preview background.
  const handleChangeImage = useCallback(() => {
    reset();
    setPreviewBackground(DEFAULT_PREVIEW_BACKGROUND);
    setNotice(null);
    setAnnouncement("");
  }, [reset]);

  // The single funnel for every input method (file picker, upload-zone drop,
  // page-level drop, clipboard paste). Everything below this point —
  // validation, decoding, preview, conversion — is shared.
  const ingestFiles = useCallback(
    (files: File[], source?: IntakeSource) => {
      if (files.length === 0) return;
      setNotice(null);
      if (source === "paste") {
        setAnnouncement(files.length > 1 ? `${files.length} images pasted from your clipboard.` : "Image pasted from your clipboard.");
      }
      if (isBatchActive || files.length > 1) {
        // A single-image workspace can't coexist with a batch queue.
        if (!isBatchActive && state.stage !== "empty" && state.stage !== "dragActive") reset();
        const { rejected } = batch.addFiles(files);
        setRejectedCount(rejected);
      } else {
        loadFile(files[0]);
      }
    },
    [batch, isBatchActive, loadFile, reset, state.stage]
  );

  const handleUploadFiles = useCallback((files: File[]) => ingestFiles(files), [ingestFiles]);

  // Page-level paste/drop is ignored while a conversion or decode is in
  // flight so a stray paste can't clobber work in progress.
  const intakeEnabled =
    !batch.state.isProcessing &&
    state.stage !== "converting" &&
    state.stage !== "preparing" &&
    state.stage !== "fileSelected";
  useImageIntake({
    enabled: intakeEnabled,
    onFiles: ingestFiles,
    onNothingToPaste: () => showNotice("No image found on your clipboard. Copy an image, then paste it here."),
  });

  // Focus management for screen transitions. Each transition unmounts the
  // control the user was on, which would drop focus to <body>:
  // - workspace appears (upload button gone) -> park on the workspace heading
  // - back to landing (workspace/result/batch gone) -> return to the upload button
  // Success, error, and batch screens focus themselves (see ResultPreview/
  // ErrorState/BatchWorkspace), so this effect only tracks landing<->workspace.
  const performScroll = useCallback((id: string, focusUpload: boolean) => {
    requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (id === "top") {
        window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      } else {
        document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }
      if (focusUpload) uploadZoneRef.current?.focus();
    });
  }, []);

  const prevLandingRef = useRef(isLanding);
  useEffect(() => {
    const wasLanding = prevLandingRef.current;
    prevLandingRef.current = isLanding;
    if (!wasLanding && isLanding) {
      // Effect runs after the landing sections have committed to the DOM,
      // so a pending nav target (see handleNavigate/scrollToUpload) is safe
      // to scroll/focus now — no race with reset()'s async re-render.
      const pending = pendingScrollRef.current;
      pendingScrollRef.current = null;
      if (pending) {
        performScroll(pending.id, pending.focusUpload);
      } else {
        requestAnimationFrame(() => uploadZoneRef.current?.focus());
      }
    } else if (wasLanding && showWorkspace) {
      requestAnimationFrame(() => workspaceHeadingRef.current?.focus());
    }
  }, [isLanding, showWorkspace, performScroll]);

  // Same reasoning as above for the ready <-> converting transition: each
  // swaps out the control that had focus (Convert button <-> Cancel
  // button live in different screens), so park focus on the new screen's
  // heading. Success/error focus themselves already (see ResultPreview /
  // ErrorState); cancelling a conversion returns to showWorkspace, covered
  // by the effect above only when landing was the prior screen, so it's
  // handled separately here.
  const prevStageRef = useRef(state.stage);
  useEffect(() => {
    const prevStage = prevStageRef.current;
    prevStageRef.current = state.stage;
    if (prevStage === state.stage) return;
    if (state.stage === "converting") {
      requestAnimationFrame(() => convertingHeadingRef.current?.focus());
    } else if (prevStage === "converting" && state.stage === "ready") {
      requestAnimationFrame(() => workspaceHeadingRef.current?.focus());
    }
  }, [state.stage]);

  const scrollToUpload = useCallback(() => {
    if (!isLanding) {
      pendingScrollRef.current = { id: "converter", focusUpload: true };
      reset();
      handleBatchReset();
      return;
    }
    performScroll("converter", true);
  }, [isLanding, reset, handleBatchReset, performScroll]);

  const handleNavigate = useCallback(
    (id: string) => {
      if (!isLanding) {
        pendingScrollRef.current = { id, focusUpload: false };
        reset();
        handleBatchReset();
        return;
      }
      performScroll(id, false);
    },
    [isLanding, reset, handleBatchReset, performScroll]
  );

  const pwaButtonText = pwa.isAppDownloaded ? "Open app on your device" : "Download on your device";

  return (
    <div className="app-shell" id="top">
      <Navigation
        onStartConverting={scrollToUpload}
        onNavigateToSection={handleNavigate}
        isConvertMode={showWorkspace}
        onConvert={convert}
        canConvert={state.stage === "ready" || isRetryableError}
        onPwaAction={pwa.handlePwaAction}
        pwaLabel={pwaButtonText}
        showPwaButton={!pwa.isStandalone}
      />

      <main className="app-main">
        {isLanding && (
          <Section className="hero" compact>
            <Container>
              <div className="hero__intro">
                <h1 className="hero__heading">Turn images into scalable vectors</h1>
                <p className="hero__subheading">
                  Upload a PNG, JPG, or WebP and get a crisp, editable SVG back — converted entirely in your
                  browser. Nothing is uploaded to a server.
                </p>
                <div className="hero__actions">
                  <Button variant="primary" className="hero__cta-primary" onClick={scrollToUpload}>
                    Start converting
                  </Button>
                  {!pwa.isStandalone && (
                    <Button
                      variant="secondary"
                      className="hero__cta-secondary"
                      onClick={pwa.handlePwaAction}
                      aria-label={pwaButtonText}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        style={{ marginRight: 8, display: "inline-block", verticalAlign: "middle" }}
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      {pwaButtonText}
                    </Button>
                  )}
                </div>
              </div>
            </Container>

            <ImageShowcase />
          </Section>
        )}

        {isBatchActive && (
          <Section compact>
            <Container wide>
              <BatchWorkspace
                items={batch.state.items}
                isProcessing={batch.state.isProcessing}
                isComplete={batch.state.isComplete}
                options={batch.state.options}
                onOptionsChange={batch.setOptions}
                onStart={batch.start}
                onCancel={batch.cancel}
                onRemoveItem={batch.removeItem}
                onAddFiles={handleAddToBatch}
                onReset={handleBatchReset}
                rejectedCount={rejectedCount}
              />
            </Container>
          </Section>
        )}

        {showWorkspace && (
          <Section compact>
            <Container wide>
              {/* Focus target when the workspace replaces the upload zone, so
                  keyboard focus is never dropped to <body>. Visually hidden:
                  sighted users already see the preview; this is a screen
                  reader landmark for the new screen. */}
              <h2 ref={workspaceHeadingRef} className="visually-hidden" tabIndex={-1}>
                Conversion workspace
              </h2>
              <div className="workspace workspace--split">
                <div className="workspace__media">
                  {state.previewUrl && <FilePreview
                      previewUrl={state.previewUrl}
                      onChangeImage={handleChangeImage}
                      background={state.decoded?.hasTransparency ? previewBackground : undefined}
                      onBackgroundChange={state.decoded?.hasTransparency ? setPreviewBackground : undefined}
                    />}

                  {state.file && (
                    <FileMetadata
                      name={state.file.name}
                      mimeType={state.decoded?.detectedMime ?? state.file.type}
                      sizeBytes={state.file.size}
                      width={state.decoded?.originalWidth ?? null}
                      height={state.decoded?.originalHeight ?? null}
                      hasTransparency={state.decoded?.hasTransparency ?? false}
                    />
                  )}

                  {quality && <QualityNotice analysis={quality} />}

                  {state.decoded?.wasDownsampled && (
                    <p className="app-notice">
                      This image was downsampled to {state.decoded.processedWidth}×
                      {state.decoded.processedHeight} for processing (original {state.decoded.originalWidth}×
                      {state.decoded.originalHeight}).
                    </p>
                  )}
                </div>

                <div className="workspace__panel">
                  {isRetryableError ? (
                    <ErrorState
                      message={state.errorMessage ?? FALLBACK_ERROR_MESSAGE}
                      hint={state.errorHint ?? FALLBACK_ERROR_HINT}
                      recovery="retry"
                      onRetry={convert}
                      onChooseNew={handleChangeImage}
                      extraHint={retryExtraHint}
                      suggestions={retrySuggestions}
                    />
                  ) : (
                    <ConversionStatus stage={state.stage} />
                  )}

                  <ConversionSettings
                    options={state.options}
                    onChange={setOptions}
                    disabled={state.stage === "preparing"}
                    onConvert={convert}
                    canConvert={state.stage === "ready" || isRetryableError}
                  />
                </div>
              </div>
            </Container>
          </Section>
        )}

        {showConverting && (
          <Section compact>
            <Container>
              <h2 ref={convertingHeadingRef} className="visually-hidden" tabIndex={-1}>
                Converting your image
              </h2>
              <ConversionLoader previewUrl={state.previewUrl} onCancel={cancel} />
            </Container>
          </Section>
        )}

        {showResult && state.result && state.previewUrl && state.file && state.decoded && (
          <Section compact>
            <Container wide>
              <ResultPreview
                sourcePreviewUrl={state.previewUrl}
                sourceFilename={state.file.name}
                result={state.result}
                decoded={state.decoded}
                onConvertAnother={handleChangeImage}
                background={previewBackground}
                onBackgroundChange={setPreviewBackground}
              />
            </Container>
          </Section>
        )}

        {showError && !isRetryableError && (
          <Section compact>
            <Container>
              <ErrorState
                message={state.errorMessage ?? FALLBACK_ERROR_MESSAGE}
                hint={state.errorHint ?? FALLBACK_ERROR_HINT}
                recovery={state.errorRecovery ?? "chooseNew"}
                onRetry={convert}
                onChooseNew={handleChangeImage}
              />
            </Container>
          </Section>
        )}

        {/* Persistent (not conditionally mounted) so screen readers reliably
            announce text changes — the ConversionStatus region covers the
            busy states, this one covers file-ready (with the filename, which
            the visual metadata alone wouldn't announce) and success. */}
        <p className="visually-hidden" role="status" aria-live="polite">
          {state.stage === "ready" && state.file
            ? `Image ${state.file.name} loaded and ready to convert.`
            : state.stage === "success"
              ? "Vectorization complete. Preview and download are ready below."
              : announcement}
        </p>

        {isLanding && (
          <>
            <Section id="how-it-works" compact>
              <Container>
                <HowItWorks />
              </Container>
            </Section>

            <Section id="converter" compact>
              <Container>
                <h2 className="section-heading">Convert an image</h2>
              </Container>
              <Container wide>
                <UploadZone
                  ref={uploadZoneRef}
                  isDragActive={state.stage === "dragActive"}
                  onFiles={handleUploadFiles}
                  onDragStateChange={setDragActive}
                  notice={notice}
                />
              </Container>
            </Section>

            <Section id="about">
              <Container>
                <h2 className="section-heading">About</h2>
                <p className="about-text">
                  Vectuno turns your PNG, JPG, or WebP images into crisp SVG vectors you can scale to any
                  size without losing quality — perfect for logos, icons, and brand work. No sign-up needed,
                  and everything happens privately on your own device.
                </p>
              </Container>
            </Section>
          </>
        )}
      </main>

      <Footer onNavigateToSection={handleNavigate} />

      <PwaInstallModal
        isOpen={pwa.showModal}
        onClose={pwa.closeModal}
        isAppDownloaded={pwa.isAppDownloaded}
        platform={pwa.platform}
      />
    </div>
  );
}

export default App;
