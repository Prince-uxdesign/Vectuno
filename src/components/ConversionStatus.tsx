import type { Stage } from "../types";
import { Button } from "./ui/Button";

interface ConversionStatusProps {
  stage: Stage;
  onConvert: () => void;
}

// The only stage rendered here is "preparing" (decode) — the only other
// pre-result busy stage, "converting", has its own dedicated screen (see
// ConversionLoader) since it's the actual vectorization work and deserves
// the full-screen progress treatment. See docs/vectorization-evaluation.md
// for why "Analyzing image" / "Tracing shapes" / etc. aren't listed here:
// imagetracerjs has no internal progress hook, so anything more granular
// than "Preparing" / "Vectorizing" would be fabricated.
export function ConversionStatus({ stage, onConvert }: ConversionStatusProps) {
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

      <Button variant="primary" className="conversion-status__cta" onClick={onConvert} disabled={stage !== "ready"}>
        Convert to SVG
      </Button>
    </div>
  );
}
