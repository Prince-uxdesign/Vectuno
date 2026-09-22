import type { ConversionResult } from "../types";

interface PreviewPanelProps {
  sourcePreviewUrl: string | null;
  result: ConversionResult | null;
}

function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function PreviewPanel({ sourcePreviewUrl, result }: PreviewPanelProps) {
  const svgDataUrl = result
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`
    : null;

  return (
    <div className="preview-panel">
      <div className="preview-panel__pane">
        <span className="preview-panel__pane-label">Original</span>
        {sourcePreviewUrl ? (
          <img src={sourcePreviewUrl} alt="Original upload" className="preview-panel__image" />
        ) : (
          <div className="preview-panel__empty">No image yet</div>
        )}
      </div>
      <div className="preview-panel__pane">
        <span className="preview-panel__pane-label">SVG result</span>
        {svgDataUrl ? (
          <img src={svgDataUrl} alt="Vectorized SVG result" className="preview-panel__image" />
        ) : (
          <div className="preview-panel__empty">Convert to see result</div>
        )}
      </div>
      {result && (
        <div className="preview-panel__stats">
          <span>{formatKB(result.sizeBytes)}</span>
          <span>{result.pathCount} paths</span>
          <span>{result.elapsedMs.toFixed(0)}ms</span>
        </div>
      )}
    </div>
  );
}
