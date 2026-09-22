interface ResultMetadataProps {
  width: number;
  height: number;
  sizeBytes: number;
  pathCount: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResultMetadata({ width, height, sizeBytes, pathCount }: ResultMetadataProps) {
  return (
    <dl className="result-metadata" aria-label="SVG details">
      <div className="result-metadata__row">
        <dt>Format</dt>
        <dd>SVG</dd>
      </div>
      <div className="result-metadata__row">
        <dt>Dimensions</dt>
        <dd>
          {width} × {height}
        </dd>
      </div>
      <div className="result-metadata__row">
        <dt>File size</dt>
        <dd>{formatBytes(sizeBytes)}</dd>
      </div>
      <div className="result-metadata__row">
        <dt>Paths</dt>
        <dd>{pathCount}</dd>
      </div>
    </dl>
  );
}
