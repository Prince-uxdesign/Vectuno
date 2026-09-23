import { useId } from "react";
import type { ConversionOptions } from "../types";
import { PresetPicker } from "./PresetPicker";
import { Button } from "./ui/Button";

interface ConversionSettingsProps {
  options: ConversionOptions;
  onChange: (options: Partial<ConversionOptions>) => void;
  disabled: boolean;
  onConvert?: () => void;
  canConvert?: boolean;
}

// Shown as the slider position while "Auto" is selected.
const AUTO_SLIDER_START = 12;

export function ConversionSettings({ options, onChange, disabled, onConvert, canConvert }: ConversionSettingsProps) {
  const colorsId = useId();
  const isMonochrome = options.preset === "monochrome";
  const customColors = options.colorCount !== null;

  return (
    <fieldset className="conversion-settings" disabled={disabled}>
      <legend className="conversion-settings__title">Conversion settings</legend>

      <PresetPicker value={options.preset} onChange={(preset) => onChange({ preset })} />

      {/* A single-color result has no palette to size, so the control only
          appears for the color presets. */}
      {!isMonochrome && (
        <details className="advanced-disclosure">
          <summary>Advanced</summary>
          <div className="conversion-settings__group conversion-settings__group--advanced">
            <span className="conversion-settings__group-label" id={colorsId}>
              Colors: {customColors ? options.colorCount : "Auto"}
            </span>
            <input
              type="range"
              min={2}
              max={64}
              value={options.colorCount ?? AUTO_SLIDER_START}
              onChange={(e) => onChange({ colorCount: Number(e.target.value) })}
              aria-labelledby={colorsId}
              aria-valuetext={customColors ? `${options.colorCount} colors` : "Automatic"}
            />
            <p className="conversion-settings__hint">
              Auto picks the number of colors from your image. Choose a number to fix the palette — fewer colors
              gives a simpler, more poster-like result.
            </p>
            {customColors && (
              <button type="button" className="conversion-settings__reset" onClick={() => onChange({ colorCount: null })}>
                Use automatic colors
              </button>
            )}
          </div>
        </details>
      )}

      {onConvert && (
        <Button variant="primary" className="conversion-settings__cta" onClick={onConvert} disabled={!canConvert}>
          Convert to SVG
        </Button>
      )}
    </fieldset>
  );
}
