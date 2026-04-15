import { createSerializer, parseAsArrayOf, parseAsString } from "nuqs";
import {
  MAX_TICKET_NAME_LENGTH,
  MAX_TICKET_NAMES,
  sanitizeTicketNameInput,
} from "@dither-booth/moderation";

export { MAX_TICKET_NAME_LENGTH, MAX_TICKET_NAMES, sanitizeTicketNameInput };

export const TICKET_QUERY_KEY = "ticket";

export const ticketNamesParser = parseAsArrayOf(parseAsString, "|").withDefault([]);

export const serializeTicketSearch = createSerializer({
  ticket: ticketNamesParser,
});

/** Shown on the ticket when the Names step is disabled (admin config). */
export const DEFAULT_BOOTH_TICKET_DISPLAY_NAMES = [
  "99Stud",
  "El Tony Mate",
  "Ginette",
] as const;

export const ticketNamesToBoothSearchRecord = (
  names: string[],
): Record<string, string> => {
  const query = serializeTicketSearch({ ticket: names }).replace(/^\?/, "");
  return Object.fromEntries(new URLSearchParams(query));
};

export const normalizeTicketNames = (names: string[]): string[] => {
  return names
    .map((name) => sanitizeTicketNameInput(name).trim())
    .filter(Boolean)
    .slice(0, MAX_TICKET_NAMES);
};
