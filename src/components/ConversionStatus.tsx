import type { Stage } from "../types";
import { Button } from "./ui/Button";

interface ConversionStatusProps {
  stage: Stage;
  onConvert: () => void;
  onCancel: () => void;
}

// Only two stages are real: imagetracerjs's imagedataToSVG is a single
// synchronous call with no internal progress hook (verified in the Phase 1
// engine evaluation), so "Analyzing image" / "Tracing shapes" / "Optimizing
// SVG" would be fabricated — there's no way to know which is actually
// happening. "Preparing image" (decode) and "Vectorizing your image" (the
// worker call) are the only two stages this pipeline can honestly report.
const HEADLINE: Partial<Record<Stage, string>> = {
  preparing: "Preparing image",
  converting: "Vectorizing your image",
};

const SUBTEXT: Partial<Record<Stage, string>> = {
  preparing: "Reading and decoding your file.",
  converting: "We're tracing the image and generating your SVG.",
};

export function ConversionStatus({ stage, onConvert, onCancel }: ConversionStatusProps) {
  const isBusy = stage === "preparing" || stage === "converting";
  const headline = HEADLINE[stage];

  return (
    <div className="conversion-status">
      <div className="conversion-status__text" role="status" aria-live="polite">
        {isBusy ? (
          <>
            <span className="conversion-status__headline">
              <span className="spinner" aria-hidden="true" />
              {headline}
            </span>
            <span className="conversion-status__subtext">{SUBTEXT[stage]}</span>
          </>
        ) : (
          stage === "ready" && <span className="conversion-status__subtext">Ready to convert.</span>
        )}
      </div>

      {stage === "converting" ? (
        <div className="conversion-status__actions">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="primary" className="conversion-status__cta" onClick={onConvert} disabled={stage !== "ready"}>
          Convert to SVG
        </Button>
      )}
    </div>
  );
}
