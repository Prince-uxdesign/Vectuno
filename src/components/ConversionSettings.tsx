import type { ConversionOptions, Level } from "../types";

interface ConversionSettingsProps {
  options: ConversionOptions;
  onChange: (options: Partial<ConversionOptions>) => void;
  disabled: boolean;
}

function Segmented<T extends string>({
  legend,
  hint,
  value,
  options,
  labels,
  onChange,
}: {
  legend: string;
  hint?: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (v: T) => void;
}) {
  const labelId = `${legend.toLowerCase().replace(/\s+/g, "-")}-label`;
  return (
    <div className="conversion-settings__group">
      <span className="conversion-settings__group-label" id={labelId}>
        {legend}
      </span>
      <div className="segmented" role="group" aria-labelledby={labelId}>
        {options.map((opt) => {
          const isActive = value === opt;
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={isActive}
              className={isActive ? "is-active" : ""}
              onClick={() => onChange(opt)}
            >
              {isActive && (
                <svg className="segmented__check" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                  <path
                    d="M3.5 8.5L6.5 11.5L12.5 4.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
              )}
              {labels[opt]}
            </button>
          );
        })}
      </div>
      {hint && <p className="conversion-settings__hint">{hint}</p>}
    </div>
  );
}

const LEVEL_OPTIONS: readonly Level[] = ["low", "medium", "high"];
const LEVEL_LABELS: Record<Level, string> = { low: "Low", medium: "Medium", high: "High" };

export function ConversionSettings({ options, onChange, disabled }: ConversionSettingsProps) {
  return (
    <fieldset className="conversion-settings" disabled={disabled}>
      <legend className="conversion-settings__title">Conversion settings</legend>

      <Segmented
        legend="Mode"
        hint="Color keeps the image's colors; Monochrome traces everything in black and white."
        value={options.colorMode}
        options={["color", "bw"] as const}
        labels={{ color: "Color", bw: "Monochrome" }}
        onChange={(colorMode) => onChange({ colorMode })}
      />

      <Segmented
        legend="Detail"
        hint="How many shapes are kept. Low keeps only the major shapes; High preserves small details too."
        value={options.detail}
        options={LEVEL_OPTIONS}
        labels={LEVEL_LABELS}
        onChange={(detail) => onChange({ detail })}
      />

      <Segmented
        legend="Smoothness"
        hint="How closely curves follow the original edges. Higher is smoother and simpler; lower is more precise."
        value={options.smoothness}
        options={LEVEL_OPTIONS}
        labels={LEVEL_LABELS}
        onChange={(smoothness) => onChange({ smoothness })}
      />

      {options.colorMode === "color" && (
        <details className="advanced-disclosure">
          <summary>Advanced</summary>
          <label className="conversion-settings__group conversion-settings__group--advanced">
            <span className="conversion-settings__group-label" id="colors-label">
              Colors: {options.numberOfColors}
            </span>
            <input
              type="range"
              min={2}
              max={64}
              value={options.numberOfColors}
              onChange={(e) => onChange({ numberOfColors: Number(e.target.value) })}
              aria-labelledby="colors-label"
              aria-valuetext={`${options.numberOfColors} colors`}
            />
            <p className="conversion-settings__hint">
              How many distinct colors the traced SVG can use. Fewer colors gives a simpler, more poster-like
              result.
            </p>
          </label>
        </details>
      )}
    </fieldset>
  );
}
