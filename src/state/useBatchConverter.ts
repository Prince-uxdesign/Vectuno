import { useCallback, useEffect, useReducer, useRef } from "react";
import { decodeImage } from "../lib/image/decode";
import { validateFile } from "../lib/image/validate";
import { vectorize } from "../lib/engine/vectorizeClient";
import {
  AppError,
  ConversionCancelled,
  createDefaultOptions,
  type ConversionOptions,
  type ConversionResult,
} from "../types";

export type BatchItemStatus = "queued" | "converting" | "done" | "error";

export interface BatchItem {
  id: string;
  file: File;
  status: BatchItemStatus;
  result: ConversionResult | null;
  errorMessage: string | null;
}

interface BatchState {
  items: BatchItem[];
  isProcessing: boolean;
  isComplete: boolean;
  options: ConversionOptions;
}

type Action =
  | { type: "ADD_FILES"; items: BatchItem[] }
  | { type: "REMOVE_ITEM"; id: string }
  | { type: "START" }
  | { type: "ITEM_CONVERTING"; id: string }
  | { type: "ITEM_DONE"; id: string; result: ConversionResult }
  | { type: "ITEM_ERROR"; id: string; message: string }
  | { type: "ITEM_RESET_QUEUED"; id: string }
  | { type: "FINISH" }
  | { type: "CANCEL_FINISH" }
  | { type: "SET_OPTIONS"; options: Partial<ConversionOptions> }
  | { type: "RESET" };

const initialState: BatchState = {
  items: [],
  isProcessing: false,
  isComplete: false,
  options: createDefaultOptions(),
};

function mapItem(state: BatchState, id: string, update: Partial<BatchItem>): BatchState {
  return { ...state, items: state.items.map((item) => (item.id === id ? { ...item, ...update } : item)) };
}

function reducer(state: BatchState, action: Action): BatchState {
  switch (action.type) {
    case "ADD_FILES":
      return { ...state, items: [...state.items, ...action.items], isComplete: false };
    case "REMOVE_ITEM":
      return { ...state, items: state.items.filter((item) => item.id !== action.id) };
    case "START":
      return { ...state, isProcessing: true, isComplete: false };
    case "ITEM_CONVERTING":
      return mapItem(state, action.id, { status: "converting", errorMessage: null });
    case "ITEM_DONE":
      return mapItem(state, action.id, { status: "done", result: action.result, errorMessage: null });
    case "ITEM_ERROR":
      return mapItem(state, action.id, { status: "error", errorMessage: action.message });
    case "ITEM_RESET_QUEUED":
      return mapItem(state, action.id, { status: "queued", errorMessage: null, result: null });
    case "FINISH":
      return { ...state, isProcessing: false, isComplete: true };
    // A cancelled run is not "complete" — untouched queued items should stay
    // resumable via the normal Convert button, not fall into the
    // download/retry/reset-only summary UI meant for an exhausted queue.
    case "CANCEL_FINISH":
      return { ...state, isProcessing: false, isComplete: false };
    case "SET_OPTIONS":
      return { ...state, options: { ...state.options, ...action.options } };
    case "RESET":
      // Preserve user options like single-file RESET does — resetting the
      // queue shouldn't wipe conversion settings.
      return { ...initialState, options: state.options };
    default:
      return state;
  }
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `batch-item-${idCounter}`;
}

// A generous ceiling, not a load-bearing limit: sequential processing (one
// worker at a time, see below) means cost scales with count regardless, so
// this exists to keep the queue UI and a single zip download sane rather
// than to protect memory.
export const MAX_BATCH_FILES = 50;

export function useBatchConverter() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  // Synchronous guard against double start() (double-click/Enter before the
  // START re-render syncs stateRef via effect). Mirrors single-file's
  // abortControllerRef guard in useConverter.
  const isStartingRef = useRef(false);

  // Synced in an effect (not during render) so callbacks always read the
  // latest state without needing every action creator in their dependency
  // arrays — this hook's async start() loop in particular needs to see
  // state mutations (cancellation, newly-added items) that happen after it
  // began running.
  useEffect(() => {
    stateRef.current = state;
  });

  const addFiles = useCallback((files: File[]) => {
    const room = MAX_BATCH_FILES - stateRef.current.items.length;
    const accepted = files.slice(0, Math.max(0, room));
    const items: BatchItem[] = accepted.map((file) => ({
      id: nextId(),
      file,
      status: "queued",
      result: null,
      errorMessage: null,
    }));
    if (items.length > 0) dispatch({ type: "ADD_FILES", items });
    return { added: items.length, rejected: files.length - items.length };
  }, []);

  const removeItem = useCallback((id: string) => {
    dispatch({ type: "REMOVE_ITEM", id });
  }, []);

  const setOptions = useCallback((options: Partial<ConversionOptions>) => {
    dispatch({ type: "SET_OPTIONS", options });
  }, []);

  // Sequential by design: imagetracerjs's trace call has no yield points, so
  // each conversion already owns a whole worker (see vectorizeClient); running
  // several of those concurrently would mean several full decoded ImageDatas
  // alive in memory at once for no real throughput gain on a single-core-bound
  // trace. One at a time keeps memory bounded to a single image regardless of
  // batch size.
  const start = useCallback(async () => {
    if (stateRef.current.isProcessing || isStartingRef.current) return;
    isStartingRef.current = true;
    cancelledRef.current = false;
    dispatch({ type: "START" });

    // Snapshot options at START so mid-batch changes can't produce a
    // heterogeneous batch.
    const batchOptions = stateRef.current.options;
    const queue = stateRef.current.items.filter((item) => item.status === "queued" || item.status === "error");
    let wasCancelled = false;

    for (const item of queue) {
      if (cancelledRef.current) {
        wasCancelled = true;
        break;
      }
      dispatch({ type: "ITEM_CONVERTING", id: item.id });
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        validateFile(item.file);
        const decoded = await decodeImage(item.file);
        if (cancelledRef.current) {
          dispatch({ type: "ITEM_RESET_QUEUED", id: item.id });
          wasCancelled = true;
          break;
        }
        const result = await vectorize(decoded, batchOptions, controller.signal);
        dispatch({ type: "ITEM_DONE", id: item.id, result });
      } catch (err) {
        if (err instanceof ConversionCancelled) {
          dispatch({ type: "ITEM_RESET_QUEUED", id: item.id });
          wasCancelled = true;
          break;
        }
        const appError =
          err instanceof AppError
            ? err
            : new AppError("UNKNOWN", "Something unexpected happened while converting this image.", "Try again, or remove this file and re-add it.");
        dispatch({ type: "ITEM_ERROR", id: item.id, message: appError.message });
      } finally {
        // Only clear if still ours — a reset()+start() may have installed a
        // newer live controller that must survive.
        if (abortControllerRef.current === controller) abortControllerRef.current = null;
      }
    }

    isStartingRef.current = false;
    dispatch({ type: wasCancelled ? "CANCEL_FINISH" : "FINISH" });
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    abortControllerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    abortControllerRef.current?.abort();
    dispatch({ type: "RESET" });
  }, []);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      abortControllerRef.current?.abort();
    };
  }, []);

  return { state, addFiles, removeItem, setOptions, start, cancel, reset };
}
