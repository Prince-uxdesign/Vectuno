import { UploadZone } from "./components/UploadZone";
import { ControlsPanel } from "./components/ControlsPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { useConverter } from "./state/useConverter";

function downloadSvg(svg: string, filename: string) {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function App() {
  const { state, loadFile, setOptions, convert, reset } = useConverter();
  const isBusy = state.stage === "validating" || state.stage === "decoding" || state.stage === "converting";

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

        {!state.file && (
          <>
            <UploadZone onFile={loadFile} />
            {state.errorMessage && <p className="app-error">{state.errorMessage}</p>}
          </>
        )}

        {state.file && (
          <div className="workspace">
            <PreviewPanel sourcePreviewUrl={state.previewUrl} result={state.result} />

            <ControlsPanel
              options={state.options}
              onChange={setOptions}
              onConvert={convert}
              isConverting={state.stage === "converting"}
              disabled={!state.decoded}
            />

            {state.decoded?.wasDownsampled && (
              <p className="app-notice">
                This image was downsampled to {state.decoded.processedWidth}×{state.decoded.processedHeight} for
                processing (original {state.decoded.originalWidth}×{state.decoded.originalHeight}).
              </p>
            )}

            {state.errorMessage && <p className="app-error">{state.errorMessage}</p>}

            <div className="workspace__actions">
              <button type="button" className="app-secondary" onClick={reset} disabled={isBusy}>
                Start over
              </button>
              {state.result && (
                <button
                  type="button"
                  className="app-primary"
                  onClick={() => downloadSvg(state.result!.svg, "vectuno-export.svg")}
                >
                  Download SVG
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
