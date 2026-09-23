import { useMemo } from "react";
import { formatSvgMarkup } from "../lib/svg/inspect";
import { formatBytes } from "../lib/utils/format";
import { CopySvgButton } from "./CopySvgButton";

interface SvgCodeViewerProps {
  svg: string;
  sizeBytes: number;
}

// The exact markup the preview renders and the download saves — shown
// formatted for readability in a scrollable panel that can't stretch the
// page. Formatting is a pure presentational pass; the copied/downloaded SVG
// is always the original string.
export function SvgCodeViewer({ svg, sizeBytes }: SvgCodeViewerProps) {
  const { text, formatted } = useMemo(() => formatSvgMarkup(svg), [svg]);
  const lineCount = useMemo(() => text.split("\n").length, [text]);

  return (
    <div className="code-viewer">
      <div className="code-viewer__meta">
        <span>
          {lineCount} {lineCount === 1 ? "line" : "lines"} · {formatBytes(sizeBytes)}
          {!formatted && " · shown unformatted (large file)"}
        </span>
        <CopySvgButton svg={svg} />
      </div>
      <pre className="code-viewer__pre" tabIndex={0} aria-label="Generated SVG markup">
        <code>{text}</code>
      </pre>
    </div>
  );
}
