// Inspection helpers over the generated SVG string. Everything here is
// derived from the actual markup the user previews and downloads — never
// from the source raster — so the palette and code view can never disagree
// with the file. No DOM parsing: a regex pass keeps this cheap even for
// large traces and avoids injecting untrusted markup anywhere.

export interface DetectedColor {
  hex: string;
  count: number;
}

const MAX_PALETTE_COLORS = 12;

// The CSS color keywords worth resolving. Anything else unknown is ignored
// rather than guessed — an omitted color is better than a wrong one.
const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#FFFFFF",
  red: "#FF0000",
  lime: "#00FF00",
  blue: "#0000FF",
  yellow: "#FFFF00",
  cyan: "#00FFFF",
  aqua: "#00FFFF",
  magenta: "#FF00FF",
  fuchsia: "#FF00FF",
  silver: "#C0C0C0",
  gray: "#808080",
  grey: "#808080",
  maroon: "#800000",
  olive: "#808000",
  green: "#008000",
  purple: "#800080",
  teal: "#008080",
  navy: "#000080",
  orange: "#FFA500",
};

function hex2(n: number): string {
  return Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, "0").toUpperCase();
}

function normalizeColor(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value === "" || value === "none" || value === "transparent" || value === "currentcolor") return null;

  const named = NAMED_COLORS[value];
  if (named) return named;

  const hex = /^#([0-9a-f]{3,8})$/.exec(value);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
    if (h.length === 6) return `#${h}`.toUpperCase();
    return null; // 4/8-digit hex carries alpha — not a flat preview color.
  }

  const rgb = /^rgba?\(\s*([^)]+)\)$/.exec(value);
  if (rgb) {
    const parts = rgb[1].split(",").map((p) => p.trim());
    if (parts.length < 3) return null;
    // An explicitly translucent fill isn't a solid swatch.
    if (parts[3] !== undefined && Number(parts[3]) < 0.99) return null;
    const channels = parts.slice(0, 3).map((p) => {
      if (p.endsWith("%")) return (Number.parseFloat(p) / 100) * 255;
      return Number(p);
    });
    if (channels.some((c) => !Number.isFinite(c))) return null;
    return `#${hex2(channels[0])}${hex2(channels[1])}${hex2(channels[2])}`;
  }

  return null;
}

// Frequency-ranked fills/strokes found in the SVG, most-used first. Counts
// are occurrences in the markup (a proxy for prominence), capped so a noisy
// photographic trace collapses to a useful summary instead of a wall of
// near-identical swatches.
export function extractPalette(svg: string, limit: number = MAX_PALETTE_COLORS): DetectedColor[] {
  const counts = new Map<string, number>();
  const record = (raw: string) => {
    const hex = normalizeColor(raw);
    if (hex) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  };

  const attrPattern = /\s(?:fill|stroke|stop-color)="([^"]*)"/gi;
  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(svg)) !== null) record(match[1]);

  const stylePattern = /style="([^"]*)"/gi;
  while ((match = stylePattern.exec(svg)) !== null) {
    for (const declaration of match[1].split(";")) {
      const [property, ...rest] = declaration.split(":");
      if (!property || rest.length === 0) continue;
      const name = property.trim().toLowerCase();
      if (name === "fill" || name === "stroke" || name === "stop-color") record(rest.join(":"));
    }
  }

  return [...counts.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count || (a.hex < b.hex ? -1 : 1))
    .slice(0, limit);
}

// Lightweight pretty-printer: one tag per line, indented by nesting depth.
// Deliberately naive (no full XML parser) — the generated SVGs are machine
// output with a regular shape, and this keeps the code view dependency-free.
// Skipped for very large files (the raw markup is shown instead) so opening
// the tab can't jank on huge traces.
const FORMAT_SIZE_LIMIT = 1_000_000;

export function formatSvgMarkup(svg: string): { text: string; formatted: boolean } {
  if (svg.length > FORMAT_SIZE_LIMIT) return { text: svg, formatted: false };
  const tokens = svg.replace(/>\s*</g, ">\n<").split("\n");
  let depth = 0;
  const lines: string[] = [];
  for (const raw of tokens) {
    const token = raw.trim();
    if (token === "") continue;
    const isClosing = /^<\//.test(token);
    const isSelfClosing = /\/>$/.test(token);
    const isDeclaration = /^<\?/.test(token) || /^<!--/.test(token);
    if (isClosing) depth = Math.max(0, depth - 1);
    lines.push(`${"  ".repeat(depth)}${token}`);
    if (!isClosing && !isSelfClosing && !isDeclaration && /^<[^!?/]/.test(token)) depth += 1;
  }
  return { text: lines.join("\n"), formatted: true };
}
