import { useEffect, useRef } from "react";
import { dataTransferHasFiles, getFilesFromClipboard } from "../lib/input/paste";

export type IntakeSource = "paste" | "drop";

interface UseImageIntakeOptions {
  enabled: boolean;
  onFiles: (files: File[], source: IntakeSource) => void;
  onNothingToPaste: () => void;
}

const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "email", "password", "number", "tel"]);

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type);
}

// Page-level entry points that feed the SAME pipeline as the file picker and
// the upload zone: paste (Cmd/Ctrl+V) and dropping a file anywhere on the
// page. This hook only normalizes what the browser hands it into File[];
// validation, decoding and preview all happen downstream, once.
//
// Paste uses the standard `paste` event, which needs no clipboard permission
// prompt (unlike navigator.clipboard.read()) and simply never fires an image
// if the browser doesn't expose one — the normal upload controls are
// unaffected either way.
export function useImageIntake({ enabled, onFiles, onNothingToPaste }: UseImageIntakeOptions) {
  const latest = useRef({ enabled, onFiles, onNothingToPaste });
  useEffect(() => {
    latest.current = { enabled, onFiles, onNothingToPaste };
  });

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (isTextEntry(event.target)) return;
      const { enabled: on, onFiles: send, onNothingToPaste: nothing } = latest.current;
      if (!on) return;
      const files = getFilesFromClipboard(event.clipboardData);
      if (files.length > 0) {
        event.preventDefault();
        send(files, "paste");
      } else {
        nothing();
      }
    };

    // Without this, dropping a file just outside the upload zone makes the
    // browser navigate away to the file itself and the user loses their place.
    const handleDragOver = (event: DragEvent) => {
      if (dataTransferHasFiles(event.dataTransfer)) event.preventDefault();
    };

    const handleDrop = (event: DragEvent) => {
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      // The upload zone handles its own drops and calls preventDefault first;
      // don't ingest the same files twice.
      const alreadyHandled = event.defaultPrevented;
      event.preventDefault();
      if (alreadyHandled) return;
      const { enabled: on, onFiles: send } = latest.current;
      if (!on) return;
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) send(files, "drop");
    };

    window.addEventListener("paste", handlePaste);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("paste", handlePaste);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);
}
