const FALLBACK_BASENAME = "vectuno-export";
// Control characters are intentionally included — they're invalid in
// filenames on Windows and worth stripping everywhere else too.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[/\\?%*:|"<>\u0000-\u001f]/g;

// "company-logo.png" -> "company-logo.<extension>". Strips the source
// extension, sanitizes characters that are unsafe in filenames across
// platforms, and falls back to a generic name if nothing usable remains.
export function deriveExportFilename(originalName: string, extension: string): string {
  const withoutExtension = originalName.replace(/\.[^./\\]+$/, "");
  const sanitized = withoutExtension
    .trim()
    .replace(UNSAFE_CHARS, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);

  const base = sanitized.length > 0 ? sanitized : FALLBACK_BASENAME;
  return `${base}.${extension}`;
}

export function deriveSvgFilename(originalName: string): string {
  return deriveExportFilename(originalName, "svg");
}
