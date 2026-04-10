import { createSerializer, parseAsArrayOf, parseAsString } from "nuqs";

const ticketNamesParser = parseAsArrayOf(parseAsString, "|").withDefault([]);

export const serializeTicketSearch = createSerializer({
  ticket: ticketNamesParser,
});
