export const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
