import { format } from "date-fns";

import type { VisitStats } from "./Event.types";

/** `65` → `1:05`: a visit lasts a minute or two, so minutes and seconds. */
export const formatVisitLength = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** An hour's start as the booth's clock reads it: `22:00`. */
export const formatHour = (iso: string): string =>
  format(new Date(iso), "HH:mm");

/** `22:00–23:00`, for the hour starting at `iso`. */
export const formatHourRange = (iso: string): string => {
  const start = new Date(iso);
  return `${format(start, "HH:mm")}–${format(start.getTime() + 3_600_000, "HH:mm")}`;
};

/** The hour with the most guests; the latest one on a tie. Null without a guest. */
export const getBusiestHour = (
  hourly: VisitStats["hourly"],
): VisitStats["hourly"][number] | null =>
  hourly.reduce<VisitStats["hourly"][number] | null>(
    (busiest, entry) =>
      entry.visits > 0 && entry.visits >= (busiest?.visits ?? 0)
        ? entry
        : busiest,
    null,
  );
