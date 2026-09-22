const STEPS = [
  {
    n: "01",
    title: "Upload",
    body: "Drop in a PNG, JPG, or WebP — or browse for one. Everything happens on your device.",
  },
  {
    n: "02",
    title: "Configure & convert",
    body: "Choose color or black-and-white, detail, and smoothing, then convert.",
  },
  {
    n: "03",
    title: "Download",
    body: "Preview the result next to your original and download a clean SVG.",
  },
];

export function HowItWorks() {
  return (
    <ol className="how-it-works">
      {STEPS.map((step) => (
        <li key={step.n} className="how-it-works__step">
          <span className="how-it-works__n" aria-hidden="true">
            {step.n}
          </span>
          <h3 className="how-it-works__title">{step.title}</h3>
          <p className="how-it-works__body">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}
