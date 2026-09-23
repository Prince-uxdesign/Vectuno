import type { Stage } from "../types";

interface ConversionStatusProps {
  stage: Stage;
}

// Status text only — the Convert to SVG actions live in the site header
// (when a file is loaded) and at the bottom of the conversion settings
// card, so this component no longer renders its own CTA button.
// The only stage rendered here is "preparing" (decode) — the only other
// pre-result busy stage, "converting", has its own dedicated screen (see
// ConversionLoader) since it's the actual vectorization work and deserves
// the full-screen progress treatment. See docs/vectorization-evaluation.md
// for why "Analyzing image" / "Tracing shapes" / etc. aren't listed here:
// imagetracerjs has no internal progress hook, so anything more granular
// than "Preparing" / "Vectorizing" would be fabricated.
export function ConversionStatus({ stage }: ConversionStatusProps) {
  const isBusy = stage === "preparing";

  return (
    <div className="conversion-status">
      <div className="conversion-status__text" role="status" aria-live="polite">
        {isBusy ? (
          <>
            <span className="conversion-status__headline">
              <span className="spinner" aria-hidden="true" />
              Preparing image
            </span>
            <span className="conversion-status__subtext">Reading and decoding your file.</span>
          </>
        ) : (
          stage === "ready" && <span className="conversion-status__subtext">Ready to convert.</span>
        )}
      </div>
    </div>
  );
}
