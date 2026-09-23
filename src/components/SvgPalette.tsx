import { useCallback, useEffect, useRef, useState } from "react";
import type { DetectedColor } from "../lib/svg/inspect";
import { copyText } from "../lib/utils/clipboard";
import { Button } from "./ui/Button";

interface SvgPaletteProps {
  colors: DetectedColor[];
}

type CopyState = "idle" | "copied" | "failed";

// The fills actually present in the generated SVG, most-used first. Labeled
// as detected (the tracer approximates the source), and copying never
// touches the SVG itself — it only places the hex values on the clipboard.
export function SvgPalette({ colors }: SvgPaletteProps) {
  const [state, setState] = useState<CopyState>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetTimerRef.current), []);

  const handleCopy = useCallback(async () => {
    clearTimeout(resetTimerRef.current);
    const succeeded = await copyText(colors.map((c) => c.hex).join("\n"));
    setState(succeeded ? "copied" : "failed");
    resetTimerRef.current = setTimeout(() => setState("idle"), 2000);
  }, [colors]);

  if (colors.length === 0) return null;

  const label = state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : "Copy palette";

  return (
    <section className="result-palette" aria-label="Detected colors">
      <h3 className="result-palette__heading">
        Detected colors <span className="result-palette__count">· {colors.length}</span>
      </h3>
      <ul className="result-palette__list">
        {colors.map((color) => (
          <li key={color.hex} className="result-palette__item">
            <span
              className="result-palette__swatch"
              style={{ backgroundColor: color.hex }}
              aria-hidden="true"
            />
            <span className="result-palette__hex">{color.hex}</span>
          </li>
        ))}
      </ul>
      <Button variant="ghost" className="result-palette__copy" onClick={handleCopy}>
        {label}
      </Button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {state !== "idle" ? label : ""}
      </span>
    </section>
  );
}
