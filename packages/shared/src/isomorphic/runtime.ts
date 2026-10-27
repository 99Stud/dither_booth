export const hasDetails = (details?: object) => {
  return details !== undefined && Object.keys(details).length > 0;
};

export const getValueType = (value: unknown) => {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (value instanceof Error) {
    return "error";
  }

  return typeof value;
};

/** `JSON.parse` that returns `undefined` instead of throwing. */
export const tryParseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};
