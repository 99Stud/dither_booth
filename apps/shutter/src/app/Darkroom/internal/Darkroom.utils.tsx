import { TRPCClientError } from "@trpc/client";

/** The tRPC error code of a failed engine call, if it was one. */
export const getTRPCErrorCode = (error: unknown): string | undefined => {
  if (!(error instanceof TRPCClientError)) return undefined;

  const data: unknown = error.data;
  return data && typeof data === "object" && "code" in data
    ? String(data.code)
    : undefined;
};

/** What the PIN screen says when unlocking fails. */
export const getUnlockErrorMessage = (
  code: string | undefined,
  message: string | undefined,
): string => {
  switch (code) {
    case "TOO_MANY_REQUESTS":
      return "Too many wrong PINs. Wait a few minutes and try again.";
    case "UNAUTHORIZED":
      return message ?? "Wrong PIN.";
    case "BAD_REQUEST":
      return "The PIN is 4 to 8 digits.";
    default:
      return "Couldn't reach the booth engine. Try again.";
  }
};
