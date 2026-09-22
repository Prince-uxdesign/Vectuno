import { useCallback, useRef, useState } from "react";

interface UploadZoneProps {
  onFile: (file: File) => void;
}

const ACCEPT = "image/png,image/jpeg,image/webp";

export function UploadZone({ onFile }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <div
      className={`upload-zone${isDragOver ? " upload-zone--active" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      aria-label="Upload an image to convert"
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="upload-zone__input"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <span className="upload-zone__label">Click, or drop your image here</span>
      <span className="upload-zone__hint">PNG, JPG, JPEG, WebP</span>
    </div>
  );
}
