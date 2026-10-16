import { useState } from "react";

const GUESTS_PER_HOUR_STORAGE_KEY = "dither-booth.admin.guests-per-hour";
const DEFAULT_GUESTS_PER_HOUR = 60;

const readGuestsPerHour = () => {
  try {
    const stored = Number(localStorage.getItem(GUESTS_PER_HOUR_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0
      ? stored
      : DEFAULT_GUESTS_PER_HOUR;
  } catch {
    return DEFAULT_GUESTS_PER_HOUR;
  }
};

/**
 * The staff's estimate of guests per hour, behind the stock forecasts.
 * Remembered in this browser only: it is a planning aid, not a setting.
 */
export const useGuestsPerHour = () => {
  const [guestsPerHour, setGuestsPerHour] = useState(readGuestsPerHour);

  const updateGuestsPerHour = (value: number) => {
    setGuestsPerHour(value);
    try {
      localStorage.setItem(GUESTS_PER_HOUR_STORAGE_KEY, String(value));
    } catch {
      // Remembering the estimate is a convenience only.
    }
  };

  return [guestsPerHour, updateGuestsPerHour] as const;
};
