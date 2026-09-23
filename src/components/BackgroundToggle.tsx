import { useId } from "react";
import type { PreviewBackground } from "../types";

interface BackgroundToggleProps {
  value: PreviewBackground;
  onChange: (value: PreviewBackground) => void;
}

const OPTIONS: { value: PreviewBackground; label: string }[] = [
  { value: "checker", label: "Checker" },
  { value: "white", label: "White" },
  { value: "black", label: "Black" },
];

// Preview-only control: it changes the backdrop behind the image on screen
// and nothing else — never the source pixels, the generated SVG, or any
// export.
export function BackgroundToggle({ value, onChange }: BackgroundToggleProps) {
  const labelId = useId();
  return (
    <div className="bg-toggle">
      <span className="bg-toggle__label" id={labelId}>
        Preview background
      </span>
      <div className="segmented bg-toggle__options" role="group" aria-labelledby={labelId}>
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? "is-active" : ""}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <span className="bg-toggle__note">Preview only — doesn't change your SVG.</span>
    </div>
  );
}
