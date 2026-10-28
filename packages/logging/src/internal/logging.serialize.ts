import {
  CIRCULAR_MARKER,
  REDACTED_MARKER,
  SECRET_KEY_WORDS,
} from "./logging.constants";

const isSecretKey = (key: string) => {
  return key
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[\s_.-]+/)
    .some((word) => SECRET_KEY_WORDS.has(word));
};

const isByteArrayView = (value: unknown): value is ArrayLike<unknown> => {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
};

/**
 * Builds a `JSON.stringify` replacer that never throws on values the booth
 * logs: big integers become strings, typed arrays (Buffer included) become
 * plain number arrays, and a reference back to an ancestor becomes a marker.
 * Shared references that aren't cycles are written out each time. Values
 * under secret-looking keys are replaced before they are read.
 */
const createLogReplacer = () => {
  const ancestors: unknown[] = [];

  return function replacer(this: unknown, key: string, value: unknown) {
    if (isSecretKey(key)) {
      return REDACTED_MARKER;
    }

    // `this` is the holder; read the raw value so Buffer's toJSON is skipped.
    const rawValue =
      key === "" ? value : (this as Record<string, unknown>)[key];

    if (typeof rawValue === "bigint") {
      return rawValue.toString();
    }

    if (isByteArrayView(rawValue)) {
      return Array.from(rawValue);
    }

    if (typeof value !== "object" || value === null) {
      return value;
    }

    while (ancestors.length > 0 && ancestors.at(-1) !== this) {
      ancestors.pop();
    }

    if (ancestors.includes(value)) {
      return CIRCULAR_MARKER;
    }

    ancestors.push(value);
    return value;
  };
};

const getUnserializableMarker = (error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error);

  return `[unserializable: ${reason}]`;
};

/**
 * Serialises a log payload to compact, single-line JSON. It never throws:
 * if the details can't be written (a getter or `toJSON` throws), they are
 * replaced by a marker that names the failure, and the event is kept.
 */
export const serializeLogPayload = (payload: Record<string, unknown>) => {
  try {
    return JSON.stringify(payload, createLogReplacer());
  } catch (error) {
    return JSON.stringify(
      { ...payload, details: getUnserializableMarker(error) },
      createLogReplacer(),
    );
  }
};

/**
 * Serialises an event's details alone, indented, with the same redaction
 * and the same never-throw guarantee: details that can't be written become
 * the marker that names the failure.
 */
export const serializeLogDetails = (
  details: Record<string, unknown>,
  indent: number,
) => {
  try {
    return JSON.stringify(details, createLogReplacer(), indent);
  } catch (error) {
    return getUnserializableMarker(error);
  }
};
