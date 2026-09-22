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
  type DecodedImage,
  type ErrorRecovery,
  type Stage,
} from "../types";

interface ConverterState {
  stage: Stage;
  file: File | null;
  previewUrl: string | null;
  decoded: DecodedImage | null;
  options: ConversionOptions;
  result: ConversionResult | null;
  errorMessage: string | null;
  errorHint: string | null;
  errorRecovery: ErrorRecovery | null;
}

type Action =
  | { type: "DRAG_ENTER" }
  | { type: "DRAG_LEAVE" }
  | { type: "FILE_SELECTED" }
  | { type: "PREPARING"; file: File; previewUrl: string }
  | { type: "READY"; decoded: DecodedImage }
  | { type: "CONVERT_START" }
  | { type: "CONVERT_SUCCESS"; result: ConversionResult }
  | { type: "CONVERT_CANCELLED" }
  | { type: "ERROR"; message: string; hint: string; recovery: ErrorRecovery }
  | { type: "SET_OPTIONS"; options: Partial<ConversionOptions> }
  | { type: "RESET" };

const initialState: ConverterState = {
  stage: "empty",
  file: null,
  previewUrl: null,
  decoded: null,
  options: DEFAULT_OPTIONS,
  result: null,
  errorMessage: null,
  errorHint: null,
  errorRecovery: null,
};

function reducer(state: ConverterState, action: Action): ConverterState {
  switch (action.type) {
    case "DRAG_ENTER":
      return state.stage === "empty" ? { ...state, stage: "dragActive" } : state;
    case "DRAG_LEAVE":
      return state.stage === "dragActive" ? { ...state, stage: "empty" } : state;
    case "FILE_SELECTED":
      return { ...state, stage: "fileSelected", errorMessage: null, errorHint: null, errorRecovery: null, result: null };
    case "PREPARING":
      return { ...state, stage: "preparing", file: action.file, previewUrl: action.previewUrl, decoded: null };
    case "READY":
      return { ...state, stage: "ready", decoded: action.decoded };
    case "CONVERT_START":
      return { ...state, stage: "converting", errorMessage: null, errorHint: null, errorRecovery: null };
    case "CONVERT_SUCCESS":
      return { ...state, stage: "success", result: action.result };
    case "CONVERT_CANCELLED":
      // Cancelling isn't a failure — go straight back to "ready", same as
      // before the user hit Convert. No error state, nothing to recover from.
      return { ...state, stage: "ready" };
    case "ERROR":
      return { ...state, stage: "error", errorMessage: action.message, errorHint: action.hint, errorRecovery: action.recovery };
    case "SET_OPTIONS":
      return { ...state, options: { ...state.options, ...action.options } };
    case "RESET":
      return { ...initialState, options: state.options };
    default:
      return state;
  }
}

export function useConverter() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const previewUrlRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Bumped on every reset() and loadFile() call so a slow-resolving
  // validate/decode from a superseded call can't dispatch onto state that
  // has since moved on (e.g. two files dropped in quick succession, or
  // "Change image" clicked while a decode is still in flight) — without
  // this, the later call's PREPARING/READY could be clobbered by the
  // earlier one resolving after it, leaving `file`/`decoded`/`previewUrl`
  // mismatched.
  const loadTokenRef = useRef(0);

  const reset = useCallback(() => {
    loadTokenRef.current += 1;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    abortControllerRef.current?.abort();
    dispatch({ type: "RESET" });
  }, []);

  const setDragActive = useCallback((active: boolean) => {
    dispatch({ type: active ? "DRAG_ENTER" : "DRAG_LEAVE" });
  }, []);

  const loadFile = useCallback(async (file: File) => {
    const token = ++loadTokenRef.current;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    dispatch({ type: "FILE_SELECTED" });

    try {
      validateFile(file);
      const previewUrl = URL.createObjectURL(file);
      if (token !== loadTokenRef.current) {
        // Superseded while validating/creating the URL — don't leak it.
        URL.revokeObjectURL(previewUrl);
        return;
      }
      previewUrlRef.current = previewUrl;
      dispatch({ type: "PREPARING", file, previewUrl });

      const decoded = await decodeImage(file);
      if (token !== loadTokenRef.current) return;
      dispatch({ type: "READY", decoded });
    } catch (err) {
      if (token !== loadTokenRef.current) return;
      const appError =
        err instanceof AppError
          ? err
          : new AppError("UNKNOWN", "Something unexpected happened while reading this file.", "Try again, or choose a different image.");
      dispatch({ type: "ERROR", message: appError.message, hint: appError.hint, recovery: appError.recovery });
    }
  }, []);

  const setOptions = useCallback((options: Partial<ConversionOptions>) => {
    dispatch({ type: "SET_OPTIONS", options });
  }, []);

  const convert = useCallback(async () => {
    if (!state.decoded) return;
    // Guard against double-submission (e.g. rapid Enter presses before the
    // CONVERT_START re-render swaps the button for Cancel): one conversion
    // owns the worker at a time.
    if (abortControllerRef.current) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    dispatch({ type: "CONVERT_START" });
    try {
      const result = await vectorize(state.decoded, state.options, controller.signal);
      dispatch({ type: "CONVERT_SUCCESS", result });
    } catch (err) {
      if (err instanceof ConversionCancelled) {
        dispatch({ type: "CONVERT_CANCELLED" });
        return;
      }
      const appError =
        err instanceof AppError
          ? err
          : new AppError("UNKNOWN", "Something unexpected happened during conversion.", "Try again, or choose a different image.");
      dispatch({ type: "ERROR", message: appError.message, hint: appError.hint, recovery: appError.recovery });
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
    }
  }, [state.decoded, state.options]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    return () => {
      loadTokenRef.current += 1;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      abortControllerRef.current?.abort();
    };
  }, []);

  return { state, loadFile, setOptions, convert, cancel, reset, setDragActive };
}
