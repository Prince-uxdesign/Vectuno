import { formatBytes } from "../lib/utils/format";

interface FileMetadataProps {
  name: string;
  // Prefer the type verified from the file's bytes once decoding finishes;
  // until then fall back to what the browser declared.
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  hasTransparency: boolean;
}

const MIME_LABELS: Record<string, string> = {
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
};

// Secondary information: the image preview is the focus, so this stays to a
// filename plus one quiet line, e.g. "PNG · 1200 × 800 · 248 KB".
export function FileMetadata({ name, mimeType, sizeBytes, width, height, hasTransparency }: FileMetadataProps) {
  const typeLabel = MIME_LABELS[mimeType] ?? (mimeType ? mimeType.replace("image/", "").toUpperCase() : "");
  const dimensions = width !== null && height !== null ? `${width} × ${height}` : null;
  const details = [typeLabel, dimensions, formatBytes(sizeBytes)].filter(Boolean).join(" · ");

  return (
    <div className="file-metadata" role="group" aria-label="Image details">
      <p className="file-metadata__name" title={name}>
        {name}
      </p>
      <p className="file-metadata__details">
        {details}
        {dimensions === null && <span className="file-metadata__pending"> · reading…</span>}
      </p>
      {hasTransparency && <p className="file-metadata__flag">Transparency detected</p>}
    </div>
  );
}
