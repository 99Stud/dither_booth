import z from "zod";

import { BOOTH_TICKET_REF_PATTERN } from "#isomorphic/formatting";

export const DEFAULT_TICKET_ITEM_NAMES = [
  "99stud",
  "El Tony Mate",
  "Épicerie Ginette",
] as const;

export const PHOTO_TICKET_TOTAL_CENTS = 1999;

export const TICKET_ITEM_NAME_MAX_LENGTH = 40;
export const TICKET_ITEM_NAMES_MAX_COUNT = 8;

export const ticketItemNamesSchema = z
  .array(z.string().trim().min(1).max(TICKET_ITEM_NAME_MAX_LENGTH))
  .min(1)
  .max(TICKET_ITEM_NAMES_MAX_COUNT);

/** Raw 6-digit booth ticket ref, as stored on a draw and printed on receipts. */
export const boothTicketRefSchema = z.string().regex(BOOTH_TICKET_REF_PATTERN);
