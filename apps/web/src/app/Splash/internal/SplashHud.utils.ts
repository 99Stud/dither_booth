export type SplashSignalPoint = {
  index: number;
  value: number;
};

const TERMINAL_LINE_TEMPLATES = [
  "99STUD :: DITHER BOOTH UNIT ONLINE",
  "DITHER_BOOTH :: PHOTO CHAMBER ARMED",
  "PRINT_RAIL :: RECEIPT PATH IDLE",
  "CAMERA_RIG :: KIOSK LENS CALIBRATED",
  "HALFTONE :: DITHER ENGINE NOMINAL",
  "SYNC_CORE :: BOOTH PIPELINE LOCKED",
  "BAR_MODE :: TOUCH INTERFACE LIVE",
  "99STUD :: AWAITING SHUTTER",
] as const;

export const getNextSyncValue = (elapsedMs: number) => {
  const primary = Math.sin(elapsedMs / 960);
  const secondary = Math.sin(elapsedMs / 2700 + 1.1);
  const tertiary = Math.cos(elapsedMs / 430 + 0.45);
  const raw = 97.2 + primary * 1.35 + secondary * 0.8 + tertiary * 0.4;

  return Math.max(94, Math.min(100, Math.round(raw * 10) / 10));
};

export const getSignalValue = (step: number) => {
  const waveA = Math.sin(step * 0.32) * 17;
  const waveB = Math.cos(step * 0.13 + 0.7) * 11;
  const waveC = Math.sin(step * 0.05 + 1.6) * 7;
  const raw = 56 + waveA + waveB + waveC;

  return Math.max(10, Math.min(98, Math.round(raw * 10) / 10));
};

export const createInitialSignalSeries = (length: number): SplashSignalPoint[] => {
  return Array.from({ length }, (_, index) => ({
    index,
    value: getSignalValue(index),
  }));
};

export const shiftSignalSeries = (
  series: SplashSignalPoint[],
  nextIndex: number,
): SplashSignalPoint[] => {
  return [...series.slice(1), { index: nextIndex, value: getSignalValue(nextIndex) }];
};

export const getTerminalLine = (step: number) => {
  const template = TERMINAL_LINE_TEMPLATES[step % TERMINAL_LINE_TEMPLATES.length];
  const channel = (step % 4) + 1;
  const hex = (0x70 + ((step * 13) % 0x1f)).toString(16).toUpperCase();

  return `[CH-${channel}] ${template} // 0x${hex}`;
};

export const appendTerminalLine = (lines: string[], nextLine: string, maxLines: number) => {
  return [...lines, nextLine].slice(-maxLines);
};
