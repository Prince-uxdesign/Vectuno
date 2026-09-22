// imagetracerjs emits only width/height on the root <svg> — no viewBox. That
// means the file doesn't scale via CSS/container sizing the way a normal
// vector export does, and some editors treat a viewBox-less SVG's canvas
// less predictably. Add one derived from the same width/height so the
// document is a "normal" scalable SVG while the rendered dimensions are
// unchanged (viewBox 0 0 W H over a W x H viewport is 1:1).
function addViewBox(svg: string): string {
  if (/\sviewBox="/.test(svg)) return svg;
  const match = /<svg\b[^>]*\swidth="([\d.]+)"[^>]*\sheight="([\d.]+)"/.exec(svg);
  if (!match) return svg;
  const [, width, height] = match;
  return svg.replace(/<svg\b/, `<svg viewBox="0 0 ${width} ${height}"`);
}

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
  return addViewBox(svg)
    .replace(/\s*desc="[^"]*"/, "")
    .replace(/\s*stroke="[^"]*"\s*stroke-width="0"/g, "")
    .replace(/\s*opacity="1"(?=[\s/>])/g, "");
}
