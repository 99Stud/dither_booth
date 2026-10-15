import { PM2_RESTART_SERVER_TIMEOUT_MS } from "#lib/pm2/pm2-control.constants";

export const HEALTHZ_SERVICE_LABELS = {
  shutter: "Shutter",
  engine: "Engine",
} as const;

export const RESTART_HEALTHZ_REFETCH_DELAY_MS = 3000;
/** Long enough for a page told to reload now to reconnect. */
export const KIOSK_RELOAD_HEALTHZ_REFETCH_DELAY_MS = 2000;
export const PM2_RESTART_WEBSOCKET_TIMEOUT_BUFFER_MS = 5_000;
export const PM2_RESTART_WEBSOCKET_TIMEOUT_MS =
  PM2_RESTART_SERVER_TIMEOUT_MS + PM2_RESTART_WEBSOCKET_TIMEOUT_BUFFER_MS;
