import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "../lib/utils/clipboard";
import { Button } from "./ui/Button";

interface FigmaHandoffProps {
  svg: string;
}

type CopyState = "idle" | "copied" | "failed";

// The honest Figma path: a browser page cannot reliably force-launch the
// Figma desktop app, so instead of faking a deep link this copies the exact
// generated SVG and tells the user the one step that matters — paste it into
// Figma, where it arrives as editable vector layers.
export function FigmaHandoff({ svg }: FigmaHandoffProps) {
  const [state, setState] = useState<CopyState>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetTimerRef.current), []);

  const handleCopy = useCallback(async () => {
    clearTimeout(resetTimerRef.current);
    const succeeded = await copyText(svg);
    setState(succeeded ? "copied" : "failed");
    resetTimerRef.current = setTimeout(() => setState("idle"), 2000);
  }, [svg]);

  const label = state === "copied" ? "Copied — paste it into Figma" : state === "failed" ? "Couldn't copy" : "Copy SVG for Figma";

  return (
    <section className="figma-handoff" aria-label="Use in Figma">
      <h3 className="figma-handoff__heading">Use in Figma</h3>
      <ol className="figma-handoff__steps">
        <li>Copy the vector below.</li>
        <li>In Figma, press Ctrl+V / ⌘V — it pastes as editable layers.</li>
      </ol>
      <Button variant="secondary" className="figma-handoff__copy" onClick={handleCopy}>
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
      <span className="visually-hidden" role="status" aria-live="polite">
        {state !== "idle" ? label : ""}
      </span>
      {state === "failed" && (
        <p className="app-error" role="alert">
          Copying failed in this browser — download the SVG and drag it into Figma instead.
        </p>
      )}
    </section>
  );
}
