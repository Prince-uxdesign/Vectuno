import { useId } from "react";
import { Button } from "./ui/Button";

export type ZoomLevel = "fit" | 1 | 2 | 4;

interface ZoomControlsProps {
  zoom: ZoomLevel;
  onChange: (zoom: ZoomLevel) => void;
  capped: boolean;
}

const ORDER: ZoomLevel[] = ["fit", 1, 2, 4];

function label(zoom: ZoomLevel): string {
  return zoom === "fit" ? "Fit" : `${zoom * 100}%`;
}

// Canvas zoom for close inspection. "Fit" shows the whole artwork;
// 100%/200%/400% render it at fixed multiples of its natural pixel size
// inside a scrollable viewport, so the page layout never breaks no matter
// how far in the user goes. Buttons are native (keyboard/touch accessible)
// and the current level is announced through a live region.
export function ZoomControls({ zoom, onChange, capped }: ZoomControlsProps) {
  const index = ORDER.indexOf(zoom);
  const canZoomOut = index > 0;
  const canZoomIn = index < ORDER.length - 1;
  const labelId = useId();

  return (
    <div className="zoom-controls">
      <div className="zoom-controls__stepper" role="group" aria-labelledby={labelId}>
        <span id={labelId} className="visually-hidden">
          Zoom the comparison preview
        </span>
        <Button
          variant="secondary"
          className="zoom-controls__step"
          onClick={() => canZoomOut && onChange(ORDER[index - 1])}
          disabled={!canZoomOut}
          aria-label="Zoom out"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
            <path d="M5 12h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </Button>
        <span className="zoom-controls__level" role="status" aria-live="polite" aria-label={`Zoom level ${label(zoom)}`}>
          {label(zoom)}
        </span>
        <Button
          variant="secondary"
          className="zoom-controls__step"
          onClick={() => canZoomIn && onChange(ORDER[index + 1])}
          disabled={!canZoomIn}
          aria-label="Zoom in"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </Button>
      </div>

      <div className="segmented zoom-controls__presets" role="group" aria-label="Zoom presets">
        {ORDER.map((level) => (
          <button
            key={String(level)}
            type="button"
            className={zoom === level ? "is-active" : ""}
            aria-pressed={zoom === level}
            onClick={() => onChange(level)}
          >
            {label(level)}
          </button>
        ))}
      </div>

      {capped && (
        <p className="zoom-controls__note">
          Zoom capped here to keep the page responsive — download the SVG to inspect it at full scale.
        </p>
      )}
    </div>
  );
}
