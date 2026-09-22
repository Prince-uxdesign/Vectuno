import type { Stage } from "../types";

interface ConversionStatusProps {
  stage: Stage;
  onConvert: () => void;
}

const STATUS_TEXT: Partial<Record<Stage, string>> = {
  preparing: "Preparing image…",
  ready: "Ready to convert.",
  converting: "Converting to SVG…",
};

export function ConversionStatus({ stage, onConvert }: ConversionStatusProps) {
  const text = STATUS_TEXT[stage];
  const isBusy = stage === "preparing" || stage === "converting";

  return (
    <div className="conversion-status">
      <p className="conversion-status__text" role="status" aria-live="polite">
        {isBusy && <span className="spinner" aria-hidden="true" />}
        {text}
      </p>
      <button
        type="button"
        className="app-primary"
        onClick={onConvert}
        disabled={stage !== "ready"}
      >
        {stage === "converting" ? "Converting…" : "Convert to SVG"}
      </button>
    </div>
  );
}
