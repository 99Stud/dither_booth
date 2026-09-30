export const TICKET_REF_ALLOCATION_ATTEMPTS = 8;

export const createBoothTicketRef = (): string =>
  Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");

export const isUniqueTicketRefConstraintError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";
  const mentionsTicketRef = error.message.includes("ticket_ref");

  if (
    (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT") &&
    mentionsTicketRef
  ) {
    return true;
  }

  return (
    error.message.includes("UNIQUE constraint failed") && mentionsTicketRef
  );
};
