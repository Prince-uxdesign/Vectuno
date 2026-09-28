import { useCallback, useEffect, useId, useRef, useState } from "react";

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
//
// The thumb and label follow the pointer immediately from local state, while
// the (layout-heavy) zoom itself is committed at most once per animation
// frame — a fast drag fires input events far quicker than the artwork can
// re-lay out, and applying every one of them is what made dragging stutter.
export function ZoomControls({ zoom, onChange, capped }: ZoomControlsProps) {
  const labelId = useId();
  const [percent, setPercent] = useState(() => Math.round(zoom * 100));
  const pendingRef = useRef<number | null>(null);
  const frameRef = useRef(0);

  // External zoom changes (e.g. a reset) still move the thumb.
  useEffect(() => {
    if (pendingRef.current === null) setPercent(Math.round(zoom * 100));
  }, [zoom]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const handleInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value);
      setPercent(next);
      pendingRef.current = next;
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        const value = pendingRef.current;
        pendingRef.current = null;
        if (value !== null) onChange(value / 100);
      });
    },
    [onChange]
  );

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
          step={1}
          value={percent}
          onChange={handleInput}
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
