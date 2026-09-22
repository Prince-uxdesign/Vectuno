import { useCallback, useReducer, useRef } from "react";
import { decodeImage } from "../lib/image/decode";
import { validateFile } from "../lib/image/validate";
import { vectorize } from "../lib/engine/vectorizeClient";
import {
  AppError,
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
  | { type: "ERROR"; message: string; recovery: ErrorRecovery }
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
  errorRecovery: null,
};

function reducer(state: ConverterState, action: Action): ConverterState {
  switch (action.type) {
    case "DRAG_ENTER":
      return state.stage === "empty" ? { ...state, stage: "dragActive" } : state;
    case "DRAG_LEAVE":
      return state.stage === "dragActive" ? { ...state, stage: "empty" } : state;
    case "FILE_SELECTED":
      return { ...state, stage: "fileSelected", errorMessage: null, errorRecovery: null, result: null };
    case "PREPARING":
      return { ...state, stage: "preparing", file: action.file, previewUrl: action.previewUrl, decoded: null };
    case "READY":
      return { ...state, stage: "ready", decoded: action.decoded };
    case "CONVERT_START":
      return { ...state, stage: "converting", errorMessage: null, errorRecovery: null };
    case "CONVERT_SUCCESS":
      return { ...state, stage: "success", result: action.result };
    case "ERROR":
      return { ...state, stage: "error", errorMessage: action.message, errorRecovery: action.recovery };
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

  const reset = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    dispatch({ type: "RESET" });
  }, []);

  const setDragActive = useCallback((active: boolean) => {
    dispatch({ type: active ? "DRAG_ENTER" : "DRAG_LEAVE" });
  }, []);

  const loadFile = useCallback(async (file: File) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    dispatch({ type: "FILE_SELECTED" });

    try {
      validateFile(file);
      const previewUrl = URL.createObjectURL(file);
      previewUrlRef.current = previewUrl;
      dispatch({ type: "PREPARING", file, previewUrl });

      const decoded = await decodeImage(file);
      dispatch({ type: "READY", decoded });
    } catch (err) {
      const appError =
        err instanceof AppError
          ? err
          : new AppError("UNKNOWN", "Something went wrong reading that file.");
      dispatch({ type: "ERROR", message: appError.message, recovery: appError.recovery });
    }
  }, []);

  const setOptions = useCallback((options: Partial<ConversionOptions>) => {
    dispatch({ type: "SET_OPTIONS", options });
  }, []);

  const convert = useCallback(async () => {
    if (!state.decoded) return;
    dispatch({ type: "CONVERT_START" });
    try {
      const result = await vectorize(state.decoded, state.options);
      dispatch({ type: "CONVERT_SUCCESS", result });
    } catch (err) {
      const appError =
        err instanceof AppError ? err : new AppError("UNKNOWN", "Conversion failed on this image.");
      dispatch({ type: "ERROR", message: appError.message, recovery: appError.recovery });
    }
  }, [state.decoded, state.options]);

  return { state, loadFile, setOptions, convert, reset, setDragActive };
}
