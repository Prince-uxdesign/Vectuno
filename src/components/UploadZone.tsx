import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { ACCEPT_ATTRIBUTE, ACCEPTED_MIME_TYPES } from "../types";
import { FileTypeHint } from "./FileTypeHint";

interface UploadZoneProps {
  isDragActive: boolean;
  onFiles: (files: File[]) => void;
  onDragStateChange: (active: boolean) => void;
  // Transient, non-alarming message (e.g. nothing image-like on the clipboard).
  notice?: string | null;
}

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
const PASTE_SHORTCUT = IS_MAC ? "⌘V" : "Ctrl+V";

function isDataTransferAcceptable(dataTransfer: DataTransfer): boolean {
  const items = Array.from(dataTransfer.items).filter((item) => item.kind === "file");
  if (items.length === 0) return true; // unknown — don't guess invalid
  // Browsers only expose `type` for file items during drag (not the file
  // itself, for security). An empty type means "unknown", not "invalid" —
  // some OS file managers never populate it. Only flag a drag as invalid
  // when we have a real, unsupported type to point to.
  const knownTypes = items.map((item) => item.type).filter(Boolean);
  if (knownTypes.length === 0) return true;
  return knownTypes.every((type) => ACCEPTED_MIME_TYPES.includes(type as (typeof ACCEPTED_MIME_TYPES)[number]));
}

// The whole zone is mouse/drag operable, but the single keyboard + screen
// reader control is a real <button> (one tab stop). The hidden file input
// stays out of the tab order so keyboard users don't hit two controls for
// the same action. Drag-and-drop only enhances the button.
export const UploadZone = forwardRef<HTMLButtonElement, UploadZoneProps>(function UploadZone(
  { isDragActive, onFiles, onDragStateChange, notice },
  forwardedRef
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useImperativeHandle(forwardedRef, () => buttonRef.current as HTMLButtonElement);
  // Drag events fire on children too; a counter avoids flicker when the
  // pointer passes over text/icons inside the drop zone.
  const dragDepthRef = useRef(0);
  const [isDragInvalid, setIsDragInvalid] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (files && files.length > 0) onFiles(Array.from(files));
    },
    [onFiles]
  );

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const dropZoneClass = [
    "upload-zone",
    isDragActive && !isDragInvalid ? "upload-zone--active" : "",
    isDragActive && isDragInvalid ? "upload-zone--invalid" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={dropZoneClass}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepthRef.current += 1;
        setIsDragInvalid(!isDataTransferAcceptable(e.dataTransfer));
        onDragStateChange(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) {
          onDragStateChange(false);
          setIsDragInvalid(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        // Handled here; the page-level drop listener must not ingest it again.
        e.stopPropagation();
        dragDepthRef.current = 0;
        onDragStateChange(false);
        setIsDragInvalid(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple
        className="upload-zone__input"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          handleFiles(e.target.files);
          // allow selecting the same file again after "Change image"
          e.target.value = "";
        }}
      />

      <button
        ref={buttonRef}
        type="button"
        className="upload-zone__button"
        onClick={openPicker}
        aria-label={
          isDragInvalid
            ? "That file type isn't supported. Accepts PNG, JPG, JPEG, or WebP."
            : "Upload one or more images to convert. Accepts PNG, JPG, JPEG, or WebP."
        }
        aria-invalid={isDragInvalid || undefined}
      >
        <span className="upload-zone__icon" aria-hidden="true">
          {isDragInvalid ? <InvalidIcon /> : <UploadIcon />}
        </span>

        {isDragInvalid ? (
          <span className="upload-zone__label">That file type isn't supported</span>
        ) : (
          <>
            <span className="upload-zone__label upload-zone__label--pointer">
              {isDragActive ? "Release to upload" : "Drop your images here"}
            </span>
            <span className="upload-zone__label upload-zone__label--touch">Add images to convert</span>
            <span className="upload-zone__sub upload-zone__sub--pointer">
              <span>or</span>
              <span className="upload-zone__browse">browse files</span>
            </span>
            <span className="upload-zone__browse-btn" aria-hidden="true">
              Browse files
            </span>
          </>
        )}

        <FileTypeHint className="upload-zone__hint" />
      </button>

      <div className="upload-zone__guidance">
        <p className="upload-zone__how">
          <span className="upload-zone__how-pointer">
            Drop an image, browse, or paste from your clipboard <kbd className="upload-zone__kbd">{PASTE_SHORTCUT}</kbd>
          </span>
          <span className="upload-zone__how-touch">Choose an image from your photos, files, or camera roll.</span>
        </p>
        <p className="upload-zone__best">Best for logos, icons, illustrations, and brand graphics.</p>
        {notice && (
          <p className="upload-zone__notice" role="status">
            {notice}
          </p>
        )}
      </div>

      {/* The visual label swap above (icon/text) isn't itself announced —
          a drag never moves focus, so a screen reader user gets no signal
          unless this transient state is pushed through a live region. */}
      <span className="visually-hidden" role="status" aria-live="assertive">
        {isDragInvalid
          ? "That file type isn't supported. Accepts PNG, JPG, JPEG, or WebP."
          : isDragActive
            ? "Release to upload your image."
            : ""}
      </span>
    </div>
  );
});

function UploadIcon() {
  return (
    <svg viewBox="0 0 40 40" width="36" height="36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M20 26V10M20 10L13 17M20 10L27 17"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 27v3a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2v-3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InvalidIcon() {
  return (
    <svg viewBox="0 0 40 40" width="36" height="36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="1.75" />
      <path d="M11 11l18 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
