export const KIOSK_LOG_PREFIX = "[kiosk]";
export const CIRCULAR_MARKER = "[circular]";
export const REDACTED_MARKER = "[redacted]";

/**
 * Words that mark a key as secret. A key matches when one of its words
 * (split on camelCase, `_`, `-`, `.` and spaces) is in this list, so
 * `wifiPassword` and `darkroom_pin` match but `spinning` doesn't.
 */
export const SECRET_KEY_WORDS: ReadonlySet<string> = new Set([
  "passphrase",
  "password",
  "pin",
  "psk",
  "secret",
  "token",
]);
