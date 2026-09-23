import { useId } from "react";
import type { PresetId } from "../types";
import { PRESET_ORDER, PRESETS } from "../lib/engine/presets";
import { CheckmarkIcon } from "./icons/CheckmarkIcon";

interface PresetPickerProps {
  value: PresetId;
  onChange: (preset: PresetId) => void;
}

// Small line icons that hint at what each preset produces. They are
// decoration only (aria-hidden); the label and description carry the meaning.
function PresetIcon({ preset }: { preset: PresetId }) {
  const common = { viewBox: "0 0 24 24", width: 22, height: 22, fill: "none", "aria-hidden": true } as const;
  const stroke = { stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (preset) {
    case "clean":
      // One smooth, simple shape.
      return (
        <svg {...common}>
          <rect x="4.5" y="4.5" width="15" height="15" rx="4.5" {...stroke} />
          <circle cx="12" cy="12" r="3" {...stroke} />
        </svg>
      );
    case "balanced":
      // Two overlapping shapes: a bit of everything.
      return (
        <svg {...common}>
          <circle cx="9.5" cy="12" r="5.5" {...stroke} />
          <circle cx="14.5" cy="12" r="5.5" {...stroke} />
        </svg>
      );
    case "detailed":
      // A finer grid of small shapes.
      return (
        <svg {...common}>
          <rect x="4" y="4" width="6" height="6" rx="1.5" {...stroke} />
          <rect x="14" y="4" width="6" height="6" rx="1.5" {...stroke} />
          <rect x="4" y="14" width="6" height="6" rx="1.5" {...stroke} />
          <circle cx="17" cy="17" r="3" {...stroke} />
        </svg>
      );
    case "monochrome":
      // Half-filled circle: a single ink color.
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7.5" {...stroke} />
          <path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" />
        </svg>
      );
  }
}

// Native radio inputs inside labels: one tab stop, arrow keys move the
// selection, and the whole card is the click target. The selected state is a
// heavier border, a filled check badge and bold text — not color alone.
export function PresetPicker({ value, onChange }: PresetPickerProps) {
  const groupId = useId();
  const labelId = `${groupId}-label`;
  return (
    <div className="preset-picker">
      <span className="conversion-settings__group-label" id={labelId}>
        Choose a preset
      </span>
      <div className="preset-picker__grid" role="radiogroup" aria-labelledby={labelId}>
        {PRESET_ORDER.map((id) => {
          const preset = PRESETS[id];
          const selected = value === id;
          return (
            <label key={id} className={`preset-card${selected ? " is-selected" : ""}`}>
              <input
                type="radio"
                name={groupId}
                value={id}
                checked={selected}
                onChange={() => onChange(id)}
                className="preset-card__input"
              />
              <span className="preset-card__icon">
                <PresetIcon preset={id} />
              </span>
              <span className="preset-card__body">
                <span className="preset-card__name">{preset.label}</span>
                <span className="preset-card__desc">{preset.description}</span>
              </span>
              <span className="preset-card__check" aria-hidden="true">
                {selected && <CheckmarkIcon size={12} />}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
