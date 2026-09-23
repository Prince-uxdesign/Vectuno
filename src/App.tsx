import { useCallback, useEffect, useRef, useState } from "react";
import { Navigation } from "./components/Navigation";
import { UploadZone } from "./components/UploadZone";
import { HowItWorks } from "./components/HowItWorks";
import { ImageShowcase } from "./components/ImageShowcase";
import { Footer } from "./components/Footer";
import { FilePreview } from "./components/FilePreview";
import { FileMetadata } from "./components/FileMetadata";
import { ConversionSettings } from "./components/ConversionSettings";
import { ConversionStatus } from "./components/ConversionStatus";
import { ConversionLoader } from "./components/ConversionLoader";
import { ResultPreview } from "./components/ResultPreview";
import { ErrorState } from "./components/ErrorState";
import { BatchWorkspace } from "./components/BatchWorkspace";
import { Container } from "./components/ui/Container";
import { Section } from "./components/ui/Section";
import { useConverter } from "./state/useConverter";
import { useBatchConverter } from "./state/useBatchConverter";

function App() {
  const { state, loadFile, setOptions, convert, cancel, reset, setDragActive } = useConverter();
  const batch = useBatchConverter();
  const [rejectedCount, setRejectedCount] = useState(0);
  const uploadZoneRef = useRef<HTMLButtonElement>(null);
  const workspaceHeadingRef = useRef<HTMLHeadingElement>(null);
  const convertingHeadingRef = useRef<HTMLHeadingElement>(null);

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

  const handleUploadFiles = useCallback(
    (files: File[]) => {
      if (files.length > 1) {
        const { rejected } = batch.addFiles(files);
        setRejectedCount(rejected);
      } else if (files.length === 1) {
        loadFile(files[0]);
      }
    },
    [batch, loadFile]
  );

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

  // Focus management for screen transitions. Each transition unmounts the
  // control the user was on, which would drop focus to <body>:
  // - workspace appears (upload button gone) -> park on the workspace heading
  // - back to landing (workspace/result/batch gone) -> return to the upload button
  // Success, error, and batch screens focus themselves (see ResultPreview/
  // ErrorState/BatchWorkspace), so this effect only tracks landing<->workspace.
  const prevLandingRef = useRef(isLanding);
  useEffect(() => {
    const wasLanding = prevLandingRef.current;
    prevLandingRef.current = isLanding;
    if (!wasLanding && isLanding) {
      requestAnimationFrame(() => uploadZoneRef.current?.focus());
    } else if (wasLanding && showWorkspace) {
      requestAnimationFrame(() => workspaceHeadingRef.current?.focus());
    }
  }, [isLanding, showWorkspace]);

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
      reset();
      handleBatchReset();
    }
    // Wait a frame so the upload zone is back in the DOM after a reset.
    requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      uploadZoneRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      uploadZoneRef.current?.focus();
    });
  }, [isLanding, reset, handleBatchReset]);

  return (
    <div className="app-shell">
      <Navigation onStartConverting={scrollToUpload} />

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
                  {state.previewUrl && <FilePreview previewUrl={state.previewUrl} onChangeImage={reset} />}

                  {state.file && (
                    <FileMetadata
                      name={state.file.name}
                      mimeType={state.file.type}
                      sizeBytes={state.file.size}
                      width={state.decoded?.originalWidth ?? null}
                      height={state.decoded?.originalHeight ?? null}
                    />
                  )}

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
                      message={state.errorMessage ?? "Something unexpected happened."}
                      hint={state.errorHint ?? "Try again, or choose a different image."}
                      recovery="retry"
                      onRetry={convert}
                      onChooseNew={reset}
                    />
                  ) : (
                    <ConversionStatus stage={state.stage} onConvert={convert} />
                  )}

                  <ConversionSettings options={state.options} onChange={setOptions} disabled={false} />
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
                onConvertAnother={reset}
              />
            </Container>
          </Section>
        )}

        {showError && !isRetryableError && (
          <Section compact>
            <Container>
              <ErrorState
                message={state.errorMessage ?? "Something unexpected happened."}
                hint={state.errorHint ?? "Try again, or choose a different image."}
                recovery={state.errorRecovery ?? "chooseNew"}
                onRetry={convert}
                onChooseNew={reset}
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
              : ""}
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
                />
              </Container>
            </Section>

            <Section id="about">
              <Container>
                <h2 className="section-heading">About</h2>
                <p className="about-text">
                  Vectuno is a focused image-to-vector converter — nothing more. There's no account to create and
                  no file storage: your image is decoded and traced locally in your browser, and nothing leaves
                  your device.
                </p>
              </Container>
            </Section>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default App;
