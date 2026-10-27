import { addDays, format, isSameDay } from "date-fns";

/** What the date-time field holds: `2026-10-31T19:05` in the booth's time. */
const TIME_INPUT_FORMAT = "yyyy-MM-dd'T'HH:mm";

/** Past midnight, an evening still reads as one when it is this short. */
const ONE_EVENING_MS = 12 * 3_600_000;

type EventTimes = { startsAt: string | null; endsAt: string | null };

/** An event time as the date-time field shows it; empty when open. */
export const toTimeInput = (iso: string | null): string =>
  iso === null ? "" : format(new Date(iso), TIME_INPUT_FORMAT);

/** The date-time field's value as ISO for the engine; null when empty. */
export const fromTimeInput = (value: string): string | null =>
  value === "" ? null : new Date(value).toISOString();

/** An event can't end before it starts; either side may stay empty. */
export const isEndAfterStart = ({
  startsAt,
  endsAt,
}: {
  startsAt: string;
  endsAt: string;
}): boolean =>
  startsAt === "" || endsAt === "" || new Date(endsAt) > new Date(startsAt);

const day = (date: Date) => format(date, "EEE d MMM");
const time = (date: Date) => format(date, "HH:mm");

/**
 * The event's start and end in one line: "Sat 31 Oct, 19:00 to 02:00" for one
 * evening, even past midnight; both days when it lasts longer; "From" or
 * "Until" with one side open; null without times.
 */
export const formatEventTimes = ({
  startsAt,
  endsAt,
}: EventTimes): string | null => {
  const start = startsAt === null ? null : new Date(startsAt);
  const end = endsAt === null ? null : new Date(endsAt);

  if (start && end) {
    const isOneEvening =
      isSameDay(start, end) ||
      (isSameDay(end, addDays(start, 1)) &&
        end.getTime() - start.getTime() < ONE_EVENING_MS);
    return isOneEvening
      ? `${day(start)}, ${time(start)} to ${time(end)}`
      : `${day(start)}, ${time(start)} to ${day(end)}, ${time(end)}`;
  }
  if (start) return `From ${day(start)}, ${time(start)}`;
  if (end) return `Until ${day(end)}, ${time(end)}`;
  return null;
};
