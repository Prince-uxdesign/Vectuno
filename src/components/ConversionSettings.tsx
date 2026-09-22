import type { ConversionOptions } from "../types";

interface ConversionSettingsProps {
  options: ConversionOptions;
  onChange: (options: Partial<ConversionOptions>) => void;
  disabled: boolean;
}

export function ConversionSettings({ options, onChange, disabled }: ConversionSettingsProps) {
  return (
    <fieldset className="conversion-settings" disabled={disabled}>
      <legend className="conversion-settings__title">Conversion settings</legend>

      <div className="conversion-settings__group">
        <span className="conversion-settings__group-label" id="color-mode-label">
          Color mode
        </span>
        <div className="segmented" role="group" aria-labelledby="color-mode-label">
          <button
            type="button"
            aria-pressed={options.colorMode === "color"}
            className={options.colorMode === "color" ? "is-active" : ""}
            onClick={() => onChange({ colorMode: "color" })}
          >
            Color
          </button>
          <button
            type="button"
            aria-pressed={options.colorMode === "bw"}
            className={options.colorMode === "bw" ? "is-active" : ""}
            onClick={() => onChange({ colorMode: "bw" })}
          >
            Black & white
          </button>
        </div>
      </div>

      {options.colorMode === "color" && (
        <label className="conversion-settings__group">
          <span className="conversion-settings__group-label">Colors: {options.numberOfColors}</span>
          <input
            type="range"
            min={2}
            max={64}
            value={options.numberOfColors}
            onChange={(e) => onChange({ numberOfColors: Number(e.target.value) })}
            aria-label="Number of colors"
          />
        </label>
      )}

      <div className="conversion-settings__group">
        <span className="conversion-settings__group-label" id="detail-label">
          Detail
        </span>
        <div className="segmented" role="group" aria-labelledby="detail-label">
          {(["low", "medium", "high"] as const).map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={options.detail === level}
              className={options.detail === level ? "is-active" : ""}
              onClick={() => onChange({ detail: level })}
            >
              {level[0].toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <label className="conversion-settings__group">
        <span className="conversion-settings__group-label">Smoothing: {Math.round(options.smoothing * 100)}%</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(options.smoothing * 100)}
          onChange={(e) => onChange({ smoothing: Number(e.target.value) / 100 })}
          aria-label="Smoothing"
        />
      </label>
    </fieldset>
  );
}
