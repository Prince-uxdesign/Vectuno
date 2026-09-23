import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui/Button";

interface CopySvgButtonProps {
  svg: string;
}

type CopyState = "idle" | "copied" | "failed";

function copyViaTextarea(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let succeeded = false;
  try {
    succeeded = document.execCommand("copy");
  } catch {
    succeeded = false;
  }
  textarea.remove();
  return succeeded;
}

export function CopySvgButton({ svg }: CopySvgButtonProps) {
  const [state, setState] = useState<CopyState>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => clearTimeout(resetTimerRef.current);
  }, []);

  const handleCopy = useCallback(async () => {
    clearTimeout(resetTimerRef.current);
    let succeeded = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(svg);
        succeeded = true;
      } else {
        succeeded = copyViaTextarea(svg);
      }
    } catch {
      succeeded = copyViaTextarea(svg);
    }
    setState(succeeded ? "copied" : "failed");
    resetTimerRef.current = setTimeout(() => setState("idle"), 2000);
  }, [svg]);

  const label = state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : "Copy SVG code";

  return (
    <>
      <Button variant="ghost" className="result-screen__copy" onClick={handleCopy}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
          <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>{label}</span>
      </Button>
      {/* aria-live inside a <button> is unreliable across screen readers —
          announce the state change through a sibling live region instead. */}
      <span className="visually-hidden" role="status" aria-live="polite">
        {state !== "idle" ? label : ""}
      </span>
    </>
  );
}
