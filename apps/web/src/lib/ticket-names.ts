import { createSerializer, parseAsArrayOf, parseAsString } from "nuqs";

export const MAX_TICKET_NAMES = 5;

export const TICKET_QUERY_KEY = "ticket";

export const ticketNamesParser = parseAsArrayOf(parseAsString, "|").withDefault([]);

export const serializeTicketSearch = createSerializer({
  ticket: ticketNamesParser,
});

export const normalizeTicketNames = (names: string[]): string[] => {
  return names
    .map((name) => name.replace(/\|/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, MAX_TICKET_NAMES);
};
