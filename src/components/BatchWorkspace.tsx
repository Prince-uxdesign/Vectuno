import { useCallback, useEffect, useMemo, useRef } from "react";
import type { BatchItem } from "../state/useBatchConverter";
import { MAX_BATCH_FILES } from "../state/useBatchConverter";
import type { ConversionOptions } from "../types";
import { ConversionSettings } from "./ConversionSettings";
import { Button } from "./ui/Button";
import { formatBytes } from "../lib/utils/format";
import { deriveExportFilename } from "../lib/utils/filename";
import { triggerBlobDownload } from "../lib/utils/download";
import { createZipBlob } from "../lib/utils/zip";

interface BatchWorkspaceProps {
  items: BatchItem[];
  isProcessing: boolean;
  isComplete: boolean;
  options: ConversionOptions;
  onOptionsChange: (options: Partial<ConversionOptions>) => void;
  onStart: () => void;
  onCancel: () => void;
  onRemoveItem: (id: string) => void;
  onAddFiles: (files: File[]) => void;
  onReset: () => void;
  rejectedCount: number;
}

const STATUS_LABEL: Record<BatchItem["status"], string> = {
  queued: "Queued",
  converting: "Converting…",
  done: "Done",
  error: "Failed",
};

function ItemDownloadButton({ item }: { item: BatchItem }) {
  if (!item.result) return null;
  return (
    <button
      type="button"
      className="batch-list__download"
      onClick={() =>
        triggerBlobDownload(new Blob([item.result!.svg], { type: "image/svg+xml" }), deriveExportFilename(item.file.name, "svg"))
      }
    >
      Download
    </button>
  );
}

export function BatchWorkspace({
  items,
  isProcessing,
  isComplete,
  options,
  onOptionsChange,
  onStart,
  onCancel,
  onRemoveItem,
  onAddFiles,
  onReset,
  rejectedCount,
}: BatchWorkspaceProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
    // Only on mount — this screen doesn't remount on later state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doneCount = useMemo(() => items.filter((i) => i.status === "done").length, [items]);
  const errorCount = useMemo(() => items.filter((i) => i.status === "error").length, [items]);
  const settledCount = doneCount + errorCount;
  const pendingCount = items.length - settledCount;
  const atCapacity = items.length >= MAX_BATCH_FILES;

  const handleAddClick = useCallback(() => addInputRef.current?.click(), []);
  const handleAddChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) onAddFiles(Array.from(e.target.files));
      e.target.value = "";
    },
    [onAddFiles]
  );

  const handleDownloadZip = useCallback(() => {
    const entries = items
      .filter((item): item is BatchItem & { result: NonNullable<BatchItem["result"]> } => item.status === "done" && item.result !== null)
      .map((item) => ({ name: deriveExportFilename(item.file.name, "svg"), content: item.result.svg }));
    if (entries.length === 0) return;
    triggerBlobDownload(createZipBlob(entries), "vectuno-svg-export.zip");
  }, [items]);

  const subheading = isProcessing
    ? `Converting ${Math.min(settledCount + 1, items.length)} of ${items.length}…`
    : isComplete
      ? `${doneCount} converted${errorCount > 0 ? `, ${errorCount} failed` : ""}.`
      : `${items.length} image${items.length === 1 ? "" : "s"} ready to convert.`;

  return (
    <div className="batch-workspace">
      <div className="batch-workspace__intro">
        <h1 ref={headingRef} className="batch-workspace__heading" tabIndex={-1}>
          Batch conversion
        </h1>
        <p className="batch-workspace__subheading" role="status" aria-live="polite">
          {subheading}
        </p>
      </div>

      <div className="batch-workspace__body">
        <div className="batch-workspace__list-column">
          <ul className="batch-list">
            {items.map((item) => (
              <li key={item.id} className={`batch-list__item batch-list__item--${item.status}`}>
                <div className="batch-list__info">
                  <span className="batch-list__filename">{item.file.name}</span>
                  <span className="batch-list__meta">
                    {formatBytes(item.file.size)}
                    {item.status === "error" && item.errorMessage ? ` · ${item.errorMessage}` : ""}
                  </span>
                </div>
                <div className="batch-list__status">
                  {item.status === "converting" && <span className="spinner" aria-hidden="true" />}
                  <span className={`batch-list__status-text batch-list__status-text--${item.status}`}>
                    {STATUS_LABEL[item.status]}
                  </span>
                  {item.status === "done" && <ItemDownloadButton item={item} />}
                  {item.status === "queued" && !isProcessing && (
                    <button
                      type="button"
                      className="batch-list__remove"
                      onClick={() => onRemoveItem(item.id)}
                      aria-label={`Remove ${item.file.name} from the batch`}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="batch-workspace__add">
            <input
              ref={addInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              multiple
              className="upload-zone__input"
              aria-hidden="true"
              tabIndex={-1}
              onChange={handleAddChange}
            />
            <Button variant="ghost" onClick={handleAddClick} disabled={isProcessing || atCapacity}>
              Add more images
            </Button>
            {atCapacity && <p className="app-notice">A batch can hold up to {MAX_BATCH_FILES} images.</p>}
            {rejectedCount > 0 && (
              <p className="app-notice">
                {rejectedCount} file{rejectedCount === 1 ? " was" : "s were"} skipped — a batch can hold up to{" "}
                {MAX_BATCH_FILES} images.
              </p>
            )}
          </div>
        </div>

        <div className="batch-workspace__panel">
          <div className="batch-workspace__actions">
            {isProcessing ? (
              <Button variant="secondary" onClick={onCancel}>
                Cancel
              </Button>
            ) : isComplete ? (
              <>
                {doneCount > 0 && (
                  <Button variant="primary" onClick={handleDownloadZip}>
                    Download all as ZIP ({doneCount})
                  </Button>
                )}
                {errorCount > 0 && (
                  <Button variant="secondary" onClick={onStart}>
                    Retry failed ({errorCount})
                  </Button>
                )}
                <Button variant="secondary" onClick={onReset}>
                  Convert another batch
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={onStart} disabled={pendingCount === 0}>
                Convert {items.length} image{items.length === 1 ? "" : "s"}
              </Button>
            )}
          </div>

          <ConversionSettings options={options} onChange={onOptionsChange} disabled={isProcessing} />
        </div>
      </div>
    </div>
  );
}
