import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConversionResult, DecodedImage, PreviewBackground } from "../types";
import { extractPalette } from "../lib/svg/inspect";
import { BackgroundToggle } from "./BackgroundToggle";
import { CompareSlider } from "./CompareSlider";
import { ResultMetadata } from "./ResultMetadata";
import { DownloadButton } from "./DownloadButton";
import { CopySvgButton } from "./CopySvgButton";
import { OpenSvgButton } from "./OpenSvgButton";
import { FigmaHandoff } from "./FigmaHandoff";
import { SvgPalette } from "./SvgPalette";
import { SvgCodeViewer } from "./SvgCodeViewer";
import { ZoomControls, type ZoomLevel } from "./ResultZoomControls";
import { RasterExportButtons } from "./RasterExportButtons";
import { Button } from "./ui/Button";

interface ResultPreviewProps {
  sourcePreviewUrl: string;
  sourceFilename: string;
  result: ConversionResult;
  decoded: DecodedImage;
  onConvertAnother: () => void;
  background: PreviewBackground;
  onBackgroundChange: (value: PreviewBackground) => void;
}

type Tab = "preview" | "code";

// Upper bound for the zoomed stage so extreme combinations (large source ×
// 400%) can't stretch the page or exhaust layout memory — the viewport
// scrolls instead, and the user is told the zoom was capped.
const MAX_STAGE_PX = 8000;

// A malformed/empty SVG can't crash dangerouslySetInnerHTML, so this is the
// only signal we have that the preview won't actually render anything.
function isRenderableSvg(svg: string): boolean {
  return /<svg[\s>]/.test(svg) && svg.includes("</svg>");
}

export function ResultPreview({ sourcePreviewUrl, sourceFilename, result, decoded, onConvertAnother, background, onBackgroundChange }: ResultPreviewProps) {
  const [downloadFailed, setDownloadFailed] = useState(false);
  const [openBlocked, setOpenBlocked] = useState(false);
  const [tab, setTab] = useState<Tab>("preview");
  const [zoom, setZoom] = useState<ZoomLevel>("fit");
  const renderable = useMemo(() => isRenderableSvg(result.svg), [result.svg]);
  // Derived from the exact markup the preview renders and the download
  // saves — one memoized pass, no duplicated SVG strings.
  const palette = useMemo(() => (renderable ? extractPalette(result.svg) : []), [renderable, result.svg]);
  // The Convert button unmounts on success, so focus would be lost to <body>.
  // Moving it to the result heading announces the new screen to screen
  // readers and leaves keyboard users close to the comparison.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const handleBlocked = useCallback(() => setOpenBlocked(true), []);

  // Fixed zoom levels render at multiples of the natural pixel size inside a
  // scrollable viewport: the artwork gets bigger, the page doesn't.
  const scale = zoom === "fit" ? null : zoom;
  const requestedStageWidth = scale === null ? null : Math.round(decoded.originalWidth * scale);
  const stageWidth = requestedStageWidth === null ? null : Math.min(requestedStageWidth, MAX_STAGE_PX);
  const zoomCapped = requestedStageWidth !== null && requestedStageWidth > MAX_STAGE_PX;

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setTab((current) => {
        if (current === "preview" && event.key === "ArrowRight") return "code";
        if (current === "code" && event.key === "ArrowLeft") return "preview";
        return current;
      });
    },
    []
  );

  return (
    <div className="result-screen">
      <div className="result-screen__intro">
        <h1 ref={headingRef} className="result-screen__heading" tabIndex={-1}>
          Your SVG is ready
        </h1>
        <p className="result-screen__subheading">Drag to compare the original against the vector.</p>
      </div>

      {renderable && (
        <div className="result-tabs segmented" role="tablist" aria-label="Result view" onKeyDown={handleTabKeyDown}>
          <button
            type="button"
            role="tab"
            id="result-tab-preview"
            aria-selected={tab === "preview"}
            aria-controls="result-panel-preview"
            tabIndex={tab === "preview" ? 0 : -1}
            className={tab === "preview" ? "is-active" : ""}
            onClick={() => setTab("preview")}
          >
            Preview
          </button>
          <button
            type="button"
            role="tab"
            id="result-tab-code"
            aria-selected={tab === "code"}
            aria-controls="result-panel-code"
            tabIndex={tab === "code" ? 0 : -1}
            className={tab === "code" ? "is-active" : ""}
            onClick={() => setTab("code")}
          >
            SVG Code
          </button>
        </div>
      )}

      <div className="result-screen__body">
        <div className="result-screen__main">
          {tab === "code" && renderable ? (
            <div
              className="result-screen__comparison result-code"
              role="tabpanel"
              id="result-panel-code"
              aria-labelledby="result-tab-code"
            >
              <SvgCodeViewer svg={result.svg} sizeBytes={result.sizeBytes} />
            </div>
          ) : (
            <>
              <div className="result-screen__zoombar">
                {renderable && <ZoomControls zoom={zoom} onChange={setZoom} capped={zoomCapped} />}
              </div>

              <div
                className="result-screen__comparison"
                role={renderable ? "tabpanel" : undefined}
                id={renderable ? "result-panel-preview" : undefined}
                aria-labelledby={renderable ? "result-tab-preview" : undefined}
              >
                {renderable ? (
                  <div className="result-viewport">
                    <div
                      className="result-viewport__stage"
                      style={stageWidth !== null ? { width: `${stageWidth}px` } : undefined}
                    >
                      <CompareSlider
                        originalUrl={sourcePreviewUrl}
                        originalFilename={sourceFilename}
                        svgMarkup={result.svg}
                        width={decoded.originalWidth}
                        height={decoded.originalHeight}
                        background={background}
                        sizeMode={stageWidth !== null ? "fill" : "fit"}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="result-screen__preview-error" role="alert">
                    <p className="result-screen__preview-error-message">The preview couldn't render this SVG.</p>
                    <p className="result-screen__preview-error-hint">
                      The file was still generated — use Download SVG or Copy SVG code below to get it.
                    </p>
                  </div>
                )}
              </div>

              {renderable && (
                <div className="result-screen__bg">
                  <BackgroundToggle value={background} onChange={onBackgroundChange} />
                </div>
              )}
            </>
          )}
        </div>

        <div className="result-screen__sidebar">
          <div className="result-screen__actions">
            <DownloadButton svg={result.svg} sourceFilename={sourceFilename} onError={() => setDownloadFailed(true)} />
            <Button variant="secondary" onClick={onConvertAnother}>
              Convert another image
            </Button>
            <CopySvgButton svg={result.svg} />
            <RasterExportButtons
              svg={result.svg}
              width={decoded.originalWidth}
              height={decoded.originalHeight}
              sourceFilename={sourceFilename}
            />
          </div>

          {downloadFailed && (
            <p className="app-error" role="alert">
              The download didn't start. Try again, or drag the preview above onto your desktop.
            </p>
          )}

          <div className="result-screen__secondary">
            <OpenSvgButton svg={result.svg} onBlocked={handleBlocked} />
            <FigmaHandoff svg={result.svg} />
          </div>

          {openBlocked && (
            <p className="app-error" role="alert">
              Couldn't open the SVG in a new tab — a popup blocker may have stopped it. Use Download SVG or
              Copy SVG code instead.
            </p>
          )}

          <details className="result-details" open>
            <summary className="result-details__summary">Technical details</summary>
            <ResultMetadata
              width={decoded.originalWidth}
              height={decoded.originalHeight}
              sizeBytes={result.sizeBytes}
              pathCount={result.pathCount}
              colorCount={renderable ? palette.length : null}
            />
          </details>

          {renderable && palette.length > 0 && <SvgPalette colors={palette} />}
        </div>
      </div>
    </div>
  );
}
