import { useCallback, useRef } from "react";

interface UploadZoneProps {
  isDragActive: boolean;
  onFile: (file: File) => void;
  onDragStateChange: (active: boolean) => void;
}

const ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";

export function UploadZone({ isDragActive, onFile, onDragStateChange }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Drag events fire on children too; a counter avoids flicker when the
  // pointer passes over the label/hint text inside the drop zone.
  const dragDepthRef = useRef(0);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <div
      className={`upload-zone${isDragActive ? " upload-zone--active" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepthRef.current += 1;
        onDragStateChange(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) onDragStateChange(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepthRef.current = 0;
        onDragStateChange(false);
        handleFiles(e.dataTransfer.files);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      aria-label="Upload an image to convert. PNG, JPG, JPEG, or WebP."
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="upload-zone__input"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          handleFiles(e.target.files);
          // allow selecting the same file again after "Change image"
          e.target.value = "";
        }}
      />
      <span className="upload-zone__label">
        {isDragActive ? "Drop to upload" : "Click, or drop your image here"}
      </span>
      <span className="upload-zone__hint">PNG, JPG, JPEG, WebP</span>
    </div>
  );
}
