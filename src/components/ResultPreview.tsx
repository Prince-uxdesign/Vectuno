import type { ConversionResult } from "../types";

interface ResultPreviewProps {
  sourcePreviewUrl: string;
  result: ConversionResult;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResultPreview({ sourcePreviewUrl, result }: ResultPreviewProps) {
  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`;

  return (
    <div className="result-preview">
      <div className="result-preview__pane">
        <span className="result-preview__pane-label">Original</span>
        <div className="result-preview__frame">
          <img src={sourcePreviewUrl} alt="Original upload" className="result-preview__image" />
        </div>
      </div>
      <div className="result-preview__pane">
        <span className="result-preview__pane-label">SVG result</span>
        <div className="result-preview__frame">
          <img src={svgDataUrl} alt="Vectorized SVG result" className="result-preview__image" />
        </div>
      </div>
      <dl className="result-preview__stats" aria-label="SVG details">
        <div>
          <dt>Size</dt>
          <dd>{formatBytes(result.sizeBytes)}</dd>
        </div>
        <div>
          <dt>Paths</dt>
          <dd>{result.pathCount}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{result.elapsedMs.toFixed(0)}ms</dd>
        </div>
      </dl>
    </div>
  );
}
