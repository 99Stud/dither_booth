export const formatPrice = (price: number) => {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(price);
};

export const capitalize = (string: string) => {
  return string.charAt(0).toUpperCase() + string.slice(1);
};

export const BOOTH_TICKET_REF_PATTERN = /^\d{6}$/;
export const BOOTH_TICKET_NUMBER_PREFIX = "STUD_DITHERBOOTH_";

export const formatBoothTicketNumber = (digits6: string): string =>
  `${BOOTH_TICKET_NUMBER_PREFIX}${digits6}`;

export const parseBoothTicketRef = (value: string): string | null => {
  const trimmed = value.trim();
  if (BOOTH_TICKET_REF_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const prefix = BOOTH_TICKET_NUMBER_PREFIX;
  if (trimmed.toUpperCase().startsWith(prefix)) {
    const digits = trimmed.slice(prefix.length);
    if (BOOTH_TICKET_REF_PATTERN.test(digits)) {
      return digits;
    }
  }

  return null;
};
