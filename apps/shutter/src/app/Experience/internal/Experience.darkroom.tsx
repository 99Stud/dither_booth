import {
  DARKROOM_HOTSPOT_TAPS,
  DARKROOM_HOTSPOT_WINDOW_MS,
} from "./Experience.constants";

/**
 * Records one tap on the Darkroom logo. Keeps only the taps still inside the
 * window and says whether this tap completes the secret sequence; once it
 * does, the count starts over.
 */
export const registerDarkroomTap = (
  previousTaps: readonly number[],
  now: number,
): { taps: number[]; opens: boolean } => {
  const taps = [
    ...previousTaps.filter((tap) => now - tap < DARKROOM_HOTSPOT_WINDOW_MS),
    now,
  ];

  return taps.length >= DARKROOM_HOTSPOT_TAPS
    ? { taps: [], opens: true }
    : { taps, opens: false };
};
