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

export const normalizeTicketNames = (names: string[]): string[] => {
  return names
    .map((name) => sanitizeTicketNameInput(name).trim())
    .filter(Boolean)
    .slice(0, MAX_TICKET_NAMES);
};
