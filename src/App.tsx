import { UploadZone } from "./components/UploadZone";
import { FilePreview } from "./components/FilePreview";
import { FileMetadata } from "./components/FileMetadata";
import { ConversionSettings } from "./components/ConversionSettings";
import { ConversionStatus } from "./components/ConversionStatus";
import { ResultPreview } from "./components/ResultPreview";
import { DownloadButton } from "./components/DownloadButton";
import { ErrorState } from "./components/ErrorState";
import { useConverter } from "./state/useConverter";

function App() {
  const { state, loadFile, setOptions, convert, reset, setDragActive } = useConverter();

  const showUpload = state.stage === "empty" || state.stage === "dragActive";
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-header__logo">Vectuno</span>
        <nav className="app-header__nav">
          <a href="#">Convert</a>
        </nav>
      </header>

      <main className="app-main">
        <div className="app-main__intro">
          <h1>Image to Vector</h1>
          <p>Upload a PNG, JPG, or WebP and convert it to a clean SVG — entirely in your browser.</p>
        </div>

        {showUpload && (
          <UploadZone
            isDragActive={state.stage === "dragActive"}
            onFile={loadFile}
            onDragStateChange={setDragActive}
          />
        )}

        {showWorkspace && (
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
                  This image was downsampled to {state.decoded.processedWidth}×{state.decoded.processedHeight} for
                  processing (original {state.decoded.originalWidth}×{state.decoded.originalHeight}).
                </p>
              )}
            </div>

            <div className="workspace__panel">
              <ConversionSettings
                options={state.options}
                onChange={setOptions}
                disabled={state.stage === "converting"}
              />

              {isRetryableError ? (
                <ErrorState
                  message={state.errorMessage ?? "Something went wrong."}
                  recovery="retry"
                  onRetry={convert}
                  onChooseNew={reset}
                />
              ) : (
                <ConversionStatus stage={state.stage} onConvert={convert} />
              )}
            </div>
          </div>
        )}

        {showResult && state.result && state.previewUrl && state.file && (
          <div className="workspace">
            <ResultPreview sourcePreviewUrl={state.previewUrl} result={state.result} />

            <div className="workspace__actions">
              <button type="button" className="app-secondary" onClick={reset}>
                Convert another image
              </button>
              <DownloadButton svg={state.result.svg} sourceFilename={state.file.name} />
            </div>
          </div>
        )}

        {showError && !isRetryableError && (
          <ErrorState
            message={state.errorMessage ?? "Something went wrong."}
            recovery={state.errorRecovery ?? "chooseNew"}
            onRetry={convert}
            onChooseNew={reset}
          />
        )}
      </main>
    </div>
  );
}

export default App;
