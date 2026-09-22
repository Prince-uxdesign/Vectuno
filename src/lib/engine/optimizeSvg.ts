// Strips output that imagetracerjs emits but that has zero visual effect —
// verified byte-for-byte inert, never touches path geometry or fill colors:
//   - `desc="Created with imagetracer.js..."` — authoring metadata only.
//   - `stroke="..." stroke-width="0"` — a zero-width stroke never renders
//     per the SVG spec, so the attributes themselves are dead weight.
//   - `opacity="1"` — 1 is the SVG default; omitting it renders identically.
// This is intentionally conservative: no path simplification, no coordinate
// rounding beyond what imagetracerjs already applied. Visual fidelity over
// file size — see product brief.
export function optimizeSvg(svg: string): string {
  return svg
    .replace(/\s*desc="[^"]*"/, "")
    .replace(/\s*stroke="[^"]*"\s*stroke-width="0"/g, "")
    .replace(/\s*opacity="1"(?=[\s/>])/g, "");
}
