import { useCallback, useState } from "react";
import { deriveExportFilename } from "../lib/utils/filename";
import { rasterizeSvg, type RasterFormat } from "../lib/utils/rasterExport";
import { Button } from "./ui/Button";

interface RasterExportButtonsProps {
  svg: string;
  width: number;
  height: number;
  sourceFilename: string;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function RasterExportButtons({ svg, width, height, sourceFilename }: RasterExportButtonsProps) {
  const [busy, setBusy] = useState<RasterFormat | null>(null);
  const [failed, setFailed] = useState<RasterFormat | null>(null);

  const handleExport = useCallback(
    async (format: RasterFormat) => {
      setFailed(null);
      setBusy(format);
      try {
        const blob = await rasterizeSvg(svg, width, height, format);
        triggerBlobDownload(blob, deriveExportFilename(sourceFilename, format === "jpeg" ? "jpg" : "png"));
      } catch {
        setFailed(format);
      } finally {
        setBusy(null);
      }
    },
    [svg, width, height, sourceFilename]
  );

  return (
    <div className="result-screen__raster-export">
      <span className="result-screen__raster-export-label">Also export as</span>
      <div className="result-screen__raster-export-buttons">
        <Button variant="ghost" onClick={() => handleExport("png")} disabled={busy !== null}>
          {busy === "png" ? "Exporting…" : "PNG"}
        </Button>
        <Button variant="ghost" onClick={() => handleExport("jpeg")} disabled={busy !== null}>
          {busy === "jpeg" ? "Exporting…" : "JPG"}
        </Button>
      </div>
      {failed && (
        <p className="app-error" role="alert">
          Couldn't export as {failed === "jpeg" ? "JPG" : "PNG"}. Try again.
        </p>
      )}
    </div>
  );
}
