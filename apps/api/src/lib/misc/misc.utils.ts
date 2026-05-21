export const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function withTimeout<T>({
  message,
  promise,
  timeoutMs,
}: {
  message: string;
  promise: Promise<T>;
  timeoutMs: number;
}): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
