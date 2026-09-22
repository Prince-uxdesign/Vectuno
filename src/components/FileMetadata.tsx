interface FileMetadataProps {
  name: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

const MIME_LABELS: Record<string, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileMetadata({ name, mimeType, sizeBytes, width, height }: FileMetadataProps) {
  const typeLabel = MIME_LABELS[mimeType] ?? mimeType.replace("image/", "").toUpperCase();

  return (
    <dl className="file-metadata" aria-label="Image details">
      <div className="file-metadata__row">
        <dt>Name</dt>
        <dd title={name}>{name}</dd>
      </div>
      <div className="file-metadata__row">
        <dt>Type</dt>
        <dd>{typeLabel}</dd>
      </div>
      <div className="file-metadata__row">
        <dt>Size</dt>
        <dd>{formatBytes(sizeBytes)}</dd>
      </div>
      <div className="file-metadata__row">
        <dt>Dimensions</dt>
        <dd>{width !== null && height !== null ? `${width} × ${height}px` : "Measuring…"}</dd>
      </div>
    </dl>
  );
}
