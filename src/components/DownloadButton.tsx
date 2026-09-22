import { useCallback } from "react";
import { deriveSvgFilename } from "../lib/utils/filename";
import { Button } from "./ui/Button";

interface DownloadButtonProps {
  svg: string;
  sourceFilename: string;
  onError?: () => void;
}

export function DownloadButton({ svg, sourceFilename, onError }: DownloadButtonProps) {
  const handleDownload = useCallback(() => {
    try {
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = deriveSvgFilename(sourceFilename);
      // Appended to the DOM: required for the download to trigger in some
      // browsers (e.g. Safari ignores clicks on detached anchors).
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      onError?.();
    }
  }, [svg, sourceFilename, onError]);

  return (
    <Button variant="primary" className="result-screen__download" onClick={handleDownload}>
      Download SVG
    </Button>
  );
}
