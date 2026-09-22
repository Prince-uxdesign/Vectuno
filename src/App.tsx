import { useCallback, useEffect, useRef } from "react";
import { Navigation } from "./components/Navigation";
import { UploadZone } from "./components/UploadZone";
import { HowItWorks } from "./components/HowItWorks";
import { FilePreview } from "./components/FilePreview";
import { FileMetadata } from "./components/FileMetadata";
import { ConversionSettings } from "./components/ConversionSettings";
import { ConversionStatus } from "./components/ConversionStatus";
import { ResultPreview } from "./components/ResultPreview";
import { ErrorState } from "./components/ErrorState";
import { Container } from "./components/ui/Container";
import { Section } from "./components/ui/Section";
import { useConverter } from "./state/useConverter";

function App() {
  const { state, loadFile, setOptions, convert, cancel, reset, setDragActive } = useConverter();
  const uploadZoneRef = useRef<HTMLButtonElement>(null);
  const workspaceHeadingRef = useRef<HTMLHeadingElement>(null);
  const prevStageRef = useRef(state.stage);

  const isLanding = state.stage === "empty" || state.stage === "dragActive";
  // A conversion (not upload) failure keeps the file context on screen —
  // the file is fine, only the last convert attempt failed — so the user
  // can retry without re-selecting anything. An upload/decode failure means
  // the file itself was rejected, so no file context exists to show.
  const isRetryableError = state.stage === "error" && state.errorRecovery === "retry";
  const showWorkspace =
    state.stage === "fileSelected" ||
    state.stage === "preparing" ||
    state.stage === "ready" ||
    state.stage === "converting" ||
    isRetryableError;
  const showResult = state.stage === "success";
  const showError = state.stage === "error";

  // Focus management for screen transitions. Each transition unmounts the
  // control the user was on, which would drop focus to <body>:
  // - workspace appears (upload button gone) -> park on the workspace heading
  // - back to landing (workspace/result gone) -> return to the upload button
  // Success and error screens focus themselves (see ResultPreview/ErrorState).
  useEffect(() => {
    const prev = prevStageRef.current;
    prevStageRef.current = state.stage;
    const wasLanding = prev === "empty" || prev === "dragActive";
    if (!wasLanding && isLanding) {
      requestAnimationFrame(() => uploadZoneRef.current?.focus());
    } else if (wasLanding && showWorkspace) {
      requestAnimationFrame(() => workspaceHeadingRef.current?.focus());
    }
  }, [state.stage, isLanding, showWorkspace]);

  const scrollToUpload = useCallback(() => {
    if (!isLanding) {
      reset();
    }
    // Wait a frame so the upload zone is back in the DOM after a reset.
    requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      uploadZoneRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      uploadZoneRef.current?.focus();
    });
  }, [isLanding, reset]);

  return (
    <div className="app-shell">
      <Navigation onStartConverting={scrollToUpload} />

      <main className="app-main">
        {isLanding && (
          <Section className="hero" compact>
            <Container>
              <div className="hero__intro">
                <h1 className="hero__heading">Turn raster images into clean vectors</h1>
                <p className="hero__subheading">
                  Upload a PNG, JPG, or WebP and get a crisp, editable SVG back — converted entirely in your
                  browser. Nothing is uploaded to a server.
                </p>
              </div>
            </Container>

            <Container wide>
              <UploadZone
                ref={uploadZoneRef}
                isDragActive={state.stage === "dragActive"}
                onFile={loadFile}
                onDragStateChange={setDragActive}
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
                  {state.previewUrl && (
                    <FilePreview
                      previewUrl={state.previewUrl}
                      onChangeImage={reset}
                      disabled={state.stage === "converting"}
                    />
                  )}

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
                    <ConversionStatus stage={state.stage} onConvert={convert} onCancel={cancel} />
                  )}

                  <ConversionSettings
                    options={state.options}
                    onChange={setOptions}
                    disabled={state.stage === "converting"}
                  />
                </div>
              </div>
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
            <Section id="how-it-works">
              <Container>
                <h2 className="section-heading">How it works</h2>
                <HowItWorks />
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
    </div>
  );
}

export default App;
