import { useCallback, useId, useRef, useState } from "react";

interface CompareSliderProps {
  originalUrl: string;
  originalFilename: string;
  svgMarkup: string;
  width: number;
  height: number;
  transparent: boolean;
}

const STEP = 5;

// Draggable before/after comparison. The divider is fully operable without
// a pointer: it's a native role="slider" (arrow keys / Home / End), and the
// Original/Split/Vector buttons below give a no-drag way to reach every
// state the handle can — see accessibility notes in the phase brief.
export function CompareSlider({ originalUrl, originalFilename, svgMarkup, width, height, transparent }: CompareSliderProps) {
  const [position, setPosition] = useState(50);
  const frameRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const labelId = useId();

  const positionFromClientX = useCallback((clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    if (rect.width === 0) return null;
    const ratio = (clientX - rect.left) / rect.width;
    return Math.min(100, Math.max(0, Math.round(ratio * 100)));
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      const next = positionFromClientX(event.clientX);
      if (next !== null) setPosition(next);
    },
    [positionFromClientX]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const next = positionFromClientX(event.clientX);
      if (next !== null) setPosition(next);
    },
    [positionFromClientX]
  );

  const stopDragging = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        setPosition((p) => Math.max(0, p - STEP));
        break;
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        setPosition((p) => Math.min(100, p + STEP));
        break;
      case "Home":
        event.preventDefault();
        setPosition(0);
        break;
      case "End":
        event.preventDefault();
        setPosition(100);
        break;
    }
  }, []);

  return (
    <div className="compare-slider">
      <div
        ref={frameRef}
        className={`compare-slider__frame${transparent ? " compare-slider__frame--checkerboard" : ""}`}
        // max-height alone (with width: 100%) can't shrink the box
        // proportionally — it just clips it, letterboxing the image
        // off-center. Deriving max-width from the same height budget via
        // this image's own ratio keeps both dimensions in proportion so
        // margin-inline: auto can center the whole frame instead.
        style={{
          aspectRatio: `${width} / ${height}`,
          maxWidth: `calc(var(--compare-max-h, min(70vh, 640px)) * ${width / height})`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        <div
          className="compare-slider__layer compare-slider__layer--vector"
          // The literal SVG the download produces — not a re-render of it —
          // so the preview can never drift from the file the user gets.
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
        <div className="compare-slider__layer compare-slider__layer--original" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
          <img src={originalUrl} alt="" className="compare-slider__image" />
        </div>

        <span className="compare-slider__tag compare-slider__tag--left" aria-hidden="true">
          Original
        </span>
        <span className="compare-slider__tag compare-slider__tag--right" aria-hidden="true">
          Vector
        </span>

        <div className="compare-slider__divider" style={{ left: `${position}%` }} aria-hidden="true" />
        <div
          className="compare-slider__handle"
          style={{ left: `${position}%` }}
          role="slider"
          tabIndex={0}
          aria-labelledby={labelId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={position}
          aria-valuetext={`${position}% original, ${100 - position}% vector`}
          onKeyDown={handleKeyDown}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
            <path d="M8 6l-5 6 5 6M16 6l5 6-5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <span id={labelId} className="visually-hidden">
        Comparison between the original image {originalFilename} and the generated SVG. Drag the handle, or use the
        arrow keys, to reveal more of one image or the other.
      </span>

      <div className="compare-slider__toggle segmented" role="group" aria-label="Switch between original and vector">
        <button type="button" className={position === 100 ? "is-active" : ""} onClick={() => setPosition(100)}>
          Original
        </button>
        <button type="button" className={position > 0 && position < 100 ? "is-active" : ""} onClick={() => setPosition(50)}>
          Split
        </button>
        <button type="button" className={position === 0 ? "is-active" : ""} onClick={() => setPosition(0)}>
          Vector
        </button>
      </div>
    </div>
  );
}
