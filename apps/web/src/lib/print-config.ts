export type DitherModeKey =
  | "none"
  | "burkes"
  | "ordered"
  | "floyd-steinberg"
  | "atkinson"
  | "stucki"
  | "sierra"
  | "sierra-lite"
  | "jarvis-judice-ninke";

export type PrintDebugParams = {
  ditherMode: DitherModeKey;
  brightness: number;
  contrast: number;
  gamma: number;
  threshold: number;
};

export const PRINT_DEBUG_DEFAULTS: PrintDebugParams = {
  ditherMode: "ordered",
  brightness: 1,
  contrast: 1,
  gamma: 1,
  threshold: 128,
};

export const arePrintDebugParamsEqual = (
  a: PrintDebugParams,
  b: PrintDebugParams,
) =>
  a.ditherMode === b.ditherMode &&
  a.brightness === b.brightness &&
  a.contrast === b.contrast &&
  a.gamma === b.gamma &&
  a.threshold === b.threshold;

const PRINT_DEBUG_CONFIG_STORAGE_KEY = "print-debug-config";

const isDitherModeKey = (value: unknown): value is DitherModeKey =>
  typeof value === "string" &&
  [
    "none",
    "burkes",
    "ordered",
    "floyd-steinberg",
    "atkinson",
    "stucki",
    "sierra",
    "sierra-lite",
    "jarvis-judice-ninke",
  ].includes(value);

const isPrintDebugParams = (value: unknown): value is PrintDebugParams => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    isDitherModeKey(candidate.ditherMode) &&
    typeof candidate.brightness === "number" &&
    typeof candidate.contrast === "number" &&
    typeof candidate.gamma === "number" &&
    typeof candidate.threshold === "number"
  );
};

export const loadSavedPrintDebugParams = (): PrintDebugParams | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(PRINT_DEBUG_CONFIG_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return isPrintDebugParams(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const savePrintDebugParams = (params: PrintDebugParams) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    PRINT_DEBUG_CONFIG_STORAGE_KEY,
    JSON.stringify(params),
  );
};
