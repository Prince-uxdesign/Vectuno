import { useId } from "react";

export type ZoomLevel = number;

interface ZoomControlsProps {
  zoom: ZoomLevel;
  onChange: (zoom: ZoomLevel) => void;
  capped: boolean;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 2;

// Canvas zoom for close inspection. A single slider (100%–200%) scales the
// artwork inside a scrollable viewport, so the page layout never breaks no
// matter how far in the user goes. Native range input: keyboard/touch
// accessible, current level announced through a live region.
export function ZoomControls({ zoom, onChange, capped }: ZoomControlsProps) {
  const labelId = useId();
  const percent = Math.round(zoom * 100);

  return (
    <div className="zoom-controls">
      <div className="zoom-controls__slider-row">
        <span id={labelId} className="visually-hidden">
          Zoom the comparison preview
        </span>
        <input
          type="range"
          className="zoom-controls__slider"
          min={MIN_ZOOM * 100}
          max={MAX_ZOOM * 100}
          step={5}
          value={percent}
          onChange={(event) => onChange(Number(event.target.value) / 100)}
          aria-labelledby={labelId}
          aria-valuetext={`${percent}%`}
        />
        <span className="zoom-controls__level" role="status" aria-live="polite" aria-label={`Zoom level ${percent}%`}>
          {percent}%
        </span>
      </div>

      {capped && (
        <p className="zoom-controls__note">
          Zoom capped here to keep the page responsive — download the SVG to inspect it at full scale.
        </p>
      )}
    </div>
  );
}
