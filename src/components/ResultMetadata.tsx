import { formatBytes } from "../lib/utils/format";

interface ResultMetadataProps {
  width: number;
  height: number;
  sizeBytes: number;
  pathCount: number;
  // Number of distinct fills detected in the SVG. Optional: only shown when
  // the caller actually computed it — never guessed.
  colorCount?: number | null;
}

export function ResultMetadata({ width, height, sizeBytes, pathCount, colorCount }: ResultMetadataProps) {
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
      {colorCount !== undefined && colorCount !== null && (
        <div className="result-metadata__row">
          <dt>Colors</dt>
          <dd>{colorCount}</dd>
        </div>
      )}
    </dl>
  );
}
