import { useRotatingFact } from "../state/useRotatingFact";
import { Button } from "./ui/Button";

interface ConversionLoaderProps {
  previewUrl: string | null;
  onCancel: () => void;
}

// The dedicated "converting" screen. imagetracerjs's imagedataToSVG is a
// single synchronous call with no internal yield points (see
// docs/vectorization-evaluation.md and vectorizeClient.ts) — there is no
// measurable percentage to report. The progress pill below is therefore
// deliberately indeterminate, never a fabricated number. The only two real
// stages this pipeline can report are "Preparing" (the decode that already
// completed before this screen can even be reached) and "Vectorizing" (the
// worker call happening now) — nothing else is instrumented, so nothing
// else is shown.
export function ConversionLoader({ previewUrl, onCancel }: ConversionLoaderProps) {
  const fact = useRotatingFact();

  return (
    <div className="conversion-loader">
      {previewUrl && (
        <div className="conversion-loader__preview">
          <img src={previewUrl} alt="" className="conversion-loader__preview-image" />
        </div>
      )}

      <div className="conversion-loader__status" role="status" aria-live="polite">
        <h2 className="conversion-loader__headline">Vectorizing your image…</h2>
        <p className="conversion-loader__subtext">We're tracing the image and generating your SVG.</p>
      </div>

      {/* Decorative — the status region above already announces the one
          state a screen reader needs ("Vectorizing your image…"). */}
      <div className="conversion-loader__stages" aria-hidden="true">
        <span className="conversion-loader__stage conversion-loader__stage--done">
          <span className="conversion-loader__stage-dot">
            <svg viewBox="0 0 16 16" width="10" height="10">
              <path
                d="M3.5 8.5L6.5 11.5L12.5 4.5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </span>
          Preparing
        </span>
        <span className="conversion-loader__stage-arrow">→</span>
        <span className="conversion-loader__stage conversion-loader__stage--active">
          <span className="conversion-loader__stage-dot" />
          Vectorizing
        </span>
      </div>

      <div
        className="conversion-loader__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext="Vectorizing your image"
        aria-label="Conversion progress"
      >
        <div className="conversion-loader__fill" />
      </div>

      <div className="conversion-loader__fact">
        <span className="conversion-loader__fact-eyebrow">Did you know?</span>
        <p key={fact.id} className="conversion-loader__fact-text">
          {fact.text}
        </p>
      </div>

      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
