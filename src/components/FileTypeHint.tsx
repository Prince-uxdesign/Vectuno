const TYPES = ["PNG", "JPG", "JPEG", "WebP"];

export function FileTypeHint({ className = "" }: { className?: string }) {
  return (
    <span className={`file-type-hint ${className}`.trim()}>
      {TYPES.map((type, i) => (
        <span key={type}>
          {i > 0 && <span className="file-type-hint__dot" aria-hidden="true">·</span>}
          {type}
        </span>
      ))}
    </span>
  );
}
