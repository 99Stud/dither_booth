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

export const getTerminalLine = (step: number) => {
  const template = TERMINAL_LINE_TEMPLATES[step % TERMINAL_LINE_TEMPLATES.length];
  const channel = (step % 4) + 1;
  const hex = (0x70 + ((step * 13) % 0x1f)).toString(16).toUpperCase();

  return `[CH-${channel}] ${template} // 0x${hex}`;
};

export const appendTerminalLine = (lines: string[], nextLine: string, maxLines: number) => {
  return [...lines, nextLine].slice(-maxLines);
};
