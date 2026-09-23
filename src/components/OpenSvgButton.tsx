import { useCallback, useEffect, useRef } from "react";
import { Button } from "./ui/Button";

interface OpenSvgButtonProps {
  svg: string;
  onBlocked: () => void;
}

// Opens the genuine generated SVG (not the raster, not an HTML mock) in a
// new tab as a blob document, so the user can inspect the raw vector in the
// browser. The URL is revoked shortly after and on unmount to avoid leaking
// large strings in memory.
export function OpenSvgButton({ svg, onBlocked }: OpenSvgButtonProps) {
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    const owned = urlsRef.current;
    return () => {
      for (const url of owned) URL.revokeObjectURL(url);
      owned.length = 0;
    };
  }, []);

  const handleOpen = useCallback(() => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    urlsRef.current.push(url);
    // No "noopener" feature string: with it, Chrome returns null even when
    // the tab opens fine, which is indistinguishable from a blocked popup.
    // Sever the opener link explicitly instead — same protection.
    const opened = window.open(url, "_blank");
    if (!opened) {
      onBlocked();
    } else {
      opened.opener = null;
    }
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
      const index = urlsRef.current.indexOf(url);
      if (index >= 0) urlsRef.current.splice(index, 1);
    }, 60_000);
  }, [svg, onBlocked]);

  return (
    <Button variant="secondary" className="result-screen__open" onClick={handleOpen}>
      Open SVG
    </Button>
  );
}
