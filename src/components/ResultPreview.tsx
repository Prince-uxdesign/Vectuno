import { useEffect, useMemo, useRef, useState } from "react";
import type { ConversionResult, DecodedImage } from "../types";
import { hasTransparency } from "../lib/image/transparency";
import { CompareSlider } from "./CompareSlider";
import { ResultMetadata } from "./ResultMetadata";
import { DownloadButton } from "./DownloadButton";
import { Button } from "./ui/Button";

interface ResultPreviewProps {
  sourcePreviewUrl: string;
  sourceFilename: string;
  result: ConversionResult;
  decoded: DecodedImage;
  onConvertAnother: () => void;
}

// A malformed/empty SVG can't crash dangerouslySetInnerHTML, so this is the
// only signal we have that the preview won't actually render anything.
function isRenderableSvg(svg: string): boolean {
  return /<svg[\s>]/.test(svg) && svg.includes("</svg>");
}

export function ResultPreview({ sourcePreviewUrl, sourceFilename, result, decoded, onConvertAnother }: ResultPreviewProps) {
  const [downloadFailed, setDownloadFailed] = useState(false);
  const transparent = useMemo(() => hasTransparency(decoded.imageData), [decoded.imageData]);
  const renderable = useMemo(() => isRenderableSvg(result.svg), [result.svg]);
  // The Convert button unmounts on success, so focus would be lost to <body>.
  // Moving it to the result heading announces the new screen to screen
  // readers and leaves keyboard users one Tab stop from the comparison.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="result-screen">
      <div className="result-screen__intro">
        <h1 ref={headingRef} className="result-screen__heading" tabIndex={-1}>
          Your SVG is ready
        </h1>
        <p className="result-screen__subheading">Drag to compare the original against the vectorized result.</p>
      </div>

      <div className="result-screen__body">
        <div className="result-screen__comparison">
          {renderable ? (
            <CompareSlider
              originalUrl={sourcePreviewUrl}
              originalFilename={sourceFilename}
              svgMarkup={result.svg}
              width={decoded.originalWidth}
              height={decoded.originalHeight}
              transparent={transparent}
            />
          ) : (
            <div className="result-screen__preview-error" role="alert">
              <p className="result-screen__preview-error-message">The preview couldn't render this SVG.</p>
              <p className="result-screen__preview-error-hint">
                The file was still generated successfully — download it below to view it.
              </p>
            </div>
          )}
        </div>

        <div className="result-screen__sidebar">
          <ResultMetadata
            width={decoded.originalWidth}
            height={decoded.originalHeight}
            sizeBytes={result.sizeBytes}
            pathCount={result.pathCount}
          />

          <div className="result-screen__actions">
            <DownloadButton svg={result.svg} sourceFilename={sourceFilename} onError={() => setDownloadFailed(true)} />
            <Button variant="secondary" onClick={onConvertAnother}>
              Convert another image
            </Button>
          </div>

          {downloadFailed && (
            <p className="app-error" role="alert">
              The download didn't start. Try again, or drag the preview above onto your desktop.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
