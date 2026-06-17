export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const getErrorCauseMessage = (cause: unknown) => {
  if (cause instanceof Error) {
    return cause.message || cause.name;
  }

  if (typeof cause === "string" && cause.length > 0) {
    return cause;
  }

  return undefined;
};
