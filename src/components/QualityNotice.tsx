import type { QualityAnalysis } from "../lib/image/quality";

interface QualityNoticeProps {
  analysis: QualityAnalysis;
}

// Expectation-setting guidance, not an error: conversion always proceeds.
// Calm by design — muted text, a small info mark, no red, no alert role (a
// polite status so screen readers announce it once without alarm).
export function QualityNotice({ analysis }: QualityNoticeProps) {
  if (!analysis.photoLike && !analysis.tiny) return null;

  return (
    <div className="quality-notice" role="status">
      {analysis.photoLike && (
        <p className="quality-notice__item">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true" className="quality-notice__icon">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
            <path d="M12 11v5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            <circle cx="12" cy="8" r="0.9" fill="currentColor" />
          </svg>
          <span>
            This image contains photographic detail or complex shading. Vectuno is optimized for logos, icons,
            illustrations, and brand graphics — complex photographs may produce larger or less precise vectors.
          </span>
        </p>
      )}
      {analysis.tiny && (
        <p className="quality-notice__item">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true" className="quality-notice__icon">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
            <path d="M12 11v5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            <circle cx="12" cy="8" r="0.9" fill="currentColor" />
          </svg>
          <span>
            This image is quite small. Higher-resolution source artwork may produce cleaner vector edges.
          </span>
        </p>
      )}
    </div>
  );
}
