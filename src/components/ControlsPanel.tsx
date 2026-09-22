import type { ConversionOptions } from "../types";

interface ControlsPanelProps {
  options: ConversionOptions;
  onChange: (options: Partial<ConversionOptions>) => void;
  onConvert: () => void;
  isConverting: boolean;
  disabled: boolean;
}

export function ControlsPanel({ options, onChange, onConvert, isConverting, disabled }: ControlsPanelProps) {
  return (
    <div className="controls-panel">
      <fieldset className="controls-panel__group">
        <legend>Color mode</legend>
        <div className="controls-panel__segmented">
          <button
            type="button"
            className={options.colorMode === "color" ? "is-active" : ""}
            onClick={() => onChange({ colorMode: "color" })}
          >
            Color
          </button>
          <button
            type="button"
            className={options.colorMode === "bw" ? "is-active" : ""}
            onClick={() => onChange({ colorMode: "bw" })}
          >
            Black & white
          </button>
        </div>
      </fieldset>

      {options.colorMode === "color" && (
        <label className="controls-panel__group">
          <span>Colors: {options.numberOfColors}</span>
          <input
            type="range"
            min={2}
            max={64}
            value={options.numberOfColors}
            onChange={(e) => onChange({ numberOfColors: Number(e.target.value) })}
          />
        </label>
      )}

      <fieldset className="controls-panel__group">
        <legend>Detail</legend>
        <div className="controls-panel__segmented">
          {(["low", "medium", "high"] as const).map((level) => (
            <button
              key={level}
              type="button"
              className={options.detail === level ? "is-active" : ""}
              onClick={() => onChange({ detail: level })}
            >
              {level[0].toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="controls-panel__group">
        <span>Smoothing: {Math.round(options.smoothing * 100)}%</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(options.smoothing * 100)}
          onChange={(e) => onChange({ smoothing: Number(e.target.value) / 100 })}
        />
      </label>

      <button type="button" className="controls-panel__convert" onClick={onConvert} disabled={disabled || isConverting}>
        {isConverting ? "Converting…" : "Convert to SVG"}
      </button>
    </div>
  );
}
