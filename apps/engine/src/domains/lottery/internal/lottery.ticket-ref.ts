import { DrizzleQueryError } from "drizzle-orm";

export const TICKET_REF_ALLOCATION_ATTEMPTS = 8;

/**
 * Random 6-digit ref in `000001`–`999999`. `000000` is reserved for the admin
 * sample tickets, so a real ticket can never be mistaken for one.
 */
export const createBoothTicketRef = (
  random: () => number = Math.random,
): string => (Math.floor(random() * 999_999) + 1).toString().padStart(6, "0");

export const isUniqueTicketRefConstraintError = (thrown: unknown): boolean => {
  // Drizzle wraps the SQLite error, and its own message holds the whole
  // query, which names `ticket_ref` whatever the conflict was.
  const error = thrown instanceof DrizzleQueryError ? thrown.cause : thrown;
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
