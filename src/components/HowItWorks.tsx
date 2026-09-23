import { useId, useState } from "react";

const STEPS = [
  {
    n: "01",
    title: "Upload",
    body: "Choose a PNG, JPG, JPEG, or WebP image — or drag one in.",
    icon: UploadIcon,
  },
  {
    n: "02",
    title: "Customize",
    body: "Adjust color, detail, and smoothness to control the result.",
    icon: CustomizeIcon,
  },
  {
    n: "03",
    title: "Vectorize",
    body: "Vectuno traces the image into scalable SVG paths in your browser.",
    icon: VectorizeIcon,
  },
  {
    n: "04",
    title: "Download",
    body: "Preview the result next to your original, then download the SVG.",
    icon: DownloadIcon,
  },
] as const;

const [featured, ...rest] = STEPS;

// A controlled disclosure rather than native <details>/<summary>: the
// grid-template-rows 0fr->1fr technique below needs a CSS transition to
// animate, which <details> can't do reliably across browsers. Built instead
// as a labelled button + aria-controls region, which is the same pattern
// native <details> gives you for free accessibility-wise, just animatable.
export function HowItWorks() {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  const triggerId = useId();

  return (
    <div className={`how-it-works${isOpen ? " how-it-works--open" : ""}`}>
      {/* The trigger button doubles as this section's heading — standard,
          valid accordion-header pattern, and avoids announcing "How it
          works" twice (once as a heading, once as the button's label). */}
      <h2 className="how-it-works__heading">
        <button
          id={triggerId}
          type="button"
          className="how-it-works__trigger"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((open) => !open)}
        >
          <span className="how-it-works__trigger-title">How it works</span>
          <span className="how-it-works__trigger-icon" aria-hidden="true" />
        </button>
      </h2>

      <div className="how-it-works__panel-track">
        <div
          id={panelId}
          role="region"
          aria-labelledby={triggerId}
          aria-hidden={!isOpen}
          className="how-it-works__panel"
        >
          <div className="how-it-works__panel-inner">
            <div className="how-it-works__feature">
              <span className="how-it-works__feature-n" aria-hidden="true">
                {featured.n}
              </span>
              <div className="how-it-works__feature-content">
                <span className="how-it-works__feature-icon" aria-hidden="true">
                  <featured.icon />
                </span>
                <h3 className="how-it-works__feature-title">{featured.title}</h3>
                <p className="how-it-works__feature-body">{featured.body}</p>
              </div>
            </div>

            <ol className="how-it-works__rest">
              {rest.map((step) => (
                <li key={step.n} className="how-it-works__step">
                  <span className="how-it-works__step-head">
                    <span className="how-it-works__step-icon" aria-hidden="true">
                      <step.icon />
                    </span>
                    <span className="how-it-works__step-n" aria-hidden="true">
                      {step.n}
                    </span>
                  </span>
                  <h3 className="how-it-works__step-title">{step.title}</h3>
                  <p className="how-it-works__step-body">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M10 13V4M10 4L6 8M10 4l4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4 14v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CustomizeIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M4 6h12M4 10h12M4 14h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="6" r="1.75" fill="currentColor" />
      <circle cx="13" cy="10" r="1.75" fill="currentColor" />
      <circle cx="7" cy="14" r="1.75" fill="currentColor" />
    </svg>
  );
}

function VectorizeIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M4 15 9 6l4 6 3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="4" cy="15" r="1.5" fill="currentColor" />
      <circle cx="9" cy="6" r="1.5" fill="currentColor" />
      <circle cx="13" cy="12" r="1.5" fill="currentColor" />
      <circle cx="16" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
      <path
        d="M10 4v9M10 13l-4-4M10 13l4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4 15v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
