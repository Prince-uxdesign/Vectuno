import { useCallback, useEffect, useReducer, useRef } from "react";
import { decodeImage } from "../lib/image/decode";
import { validateFile } from "../lib/image/validate";
import { vectorize } from "../lib/engine/vectorizeClient";
import {
  AppError,
  ConversionCancelled,
  DEFAULT_OPTIONS,
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
  options: DEFAULT_OPTIONS,
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
      return mapItem(state, action.id, { status: "converting" });
    case "ITEM_DONE":
      return mapItem(state, action.id, { status: "done", result: action.result, errorMessage: null });
    case "ITEM_ERROR":
      return mapItem(state, action.id, { status: "error", errorMessage: action.message });
    case "ITEM_RESET_QUEUED":
      return mapItem(state, action.id, { status: "queued" });
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
      return initialState;
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
    if (stateRef.current.isProcessing) return;
    cancelledRef.current = false;
    dispatch({ type: "START" });

    const queue = stateRef.current.items.filter((item) => item.status === "queued" || item.status === "error");
    let wasCancelled = false;

    for (const item of queue) {
      if (cancelledRef.current) {
        wasCancelled = true;
        break;
      }
      dispatch({ type: "ITEM_CONVERTING", id: item.id });
      try {
        validateFile(item.file);
        const decoded = await decodeImage(item.file);
        if (cancelledRef.current) {
          dispatch({ type: "ITEM_RESET_QUEUED", id: item.id });
          wasCancelled = true;
          break;
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const result = await vectorize(decoded, stateRef.current.options, controller.signal);
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
            : new AppError("UNKNOWN", "Something unexpected happened while converting this image.", "");
        dispatch({ type: "ITEM_ERROR", id: item.id, message: appError.message });
      } finally {
        abortControllerRef.current = null;
      }
    }

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
