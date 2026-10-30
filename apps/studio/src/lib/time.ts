import { format } from "date-fns";

/** A datetime-local input's value, in this device's time zone. */
export const toLocalInput = (iso: string | null) =>
  iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "";
