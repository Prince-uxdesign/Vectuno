import { useCallback } from "react";
import { deriveSvgFilename } from "../lib/utils/filename";

interface DownloadButtonProps {
  svg: string;
  sourceFilename: string;
}

export function DownloadButton({ svg, sourceFilename }: DownloadButtonProps) {
  const handleDownload = useCallback(() => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = deriveSvgFilename(sourceFilename);
    a.click();
    URL.revokeObjectURL(url);
  }, [svg, sourceFilename]);

  return (
    <button type="button" className="app-primary" onClick={handleDownload}>
      Download SVG
    </button>
  );
}
