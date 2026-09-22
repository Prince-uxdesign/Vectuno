import { useCallback, useRef, useState } from "react";
import { decodeImage } from "../lib/image/decode";
import { validateFile } from "../lib/image/validate";
import { vectorize } from "../lib/engine/vectorizeClient";
import {
  AppError,
  DEFAULT_OPTIONS,
  type ConversionOptions,
  type ConversionResult,
  type DecodedImage,
  type PipelineStage,
} from "../types";

interface ConverterState {
  stage: PipelineStage;
  file: File | null;
  previewUrl: string | null;
  decoded: DecodedImage | null;
  options: ConversionOptions;
  result: ConversionResult | null;
  errorMessage: string | null;
}

const initialState: ConverterState = {
  stage: "idle",
  file: null,
  previewUrl: null,
  decoded: null,
  options: DEFAULT_OPTIONS,
  result: null,
  errorMessage: null,
};

export function useConverter() {
  const [state, setState] = useState<ConverterState>(initialState);
  const previewUrlRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setState(initialState);
  }, []);

  const loadFile = useCallback(async (file: File) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    setState((s) => ({ ...s, stage: "validating", errorMessage: null, result: null }));
    try {
      validateFile(file);
      const previewUrl = URL.createObjectURL(file);
      previewUrlRef.current = previewUrl;
      setState((s) => ({ ...s, stage: "decoding", file, previewUrl }));

      const decoded = await decodeImage(file);
      setState((s) => ({ ...s, stage: "idle", decoded }));
    } catch (err) {
      const message = err instanceof AppError ? err.message : "Something went wrong reading that file.";
      setState((s) => ({ ...s, stage: "error", errorMessage: message }));
    }
  }, []);

  const setOptions = useCallback((options: Partial<ConversionOptions>) => {
    setState((s) => ({ ...s, options: { ...s.options, ...options } }));
  }, []);

  const convert = useCallback(async () => {
    if (!state.decoded) return;
    setState((s) => ({ ...s, stage: "converting", errorMessage: null }));
    try {
      const result = await vectorize(state.decoded, state.options);
      setState((s) => ({ ...s, stage: "done", result }));
    } catch (err) {
      const message = err instanceof AppError ? err.message : "Conversion failed on this image.";
      setState((s) => ({ ...s, stage: "error", errorMessage: message }));
    }
  }, [state.decoded, state.options]);

  return { state, loadFile, setOptions, convert, reset };
}
