import { createSerializer, parseAsArrayOf, parseAsString } from "nuqs";

export const MAX_TICKET_NAMES = 5;
export const MAX_TICKET_NAME_LENGTH = 80;

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

export const sanitizeTicketNameInput = (value: string): string => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\|/g, " ")
    .replace(/[^A-Z ]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^ /, "")
    .slice(0, MAX_TICKET_NAME_LENGTH);
};
