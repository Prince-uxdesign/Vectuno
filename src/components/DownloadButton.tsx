import { useCallback } from "react";
import { deriveSvgFilename } from "../lib/utils/filename";
import { triggerBlobDownload } from "../lib/utils/download";
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
      triggerBlobDownload(blob, deriveSvgFilename(sourceFilename));
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
