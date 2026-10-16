import type USB from "@node-escpos/usb-adapter";
import type { Page } from "puppeteer";

import type { DB } from "#db/internal/db.types";
import type { DarkroomAccess } from "#domains/darkroom/darkroom.service";
import type {
  KioskChannel,
  KioskMaintenance,
} from "#domains/kiosk/kiosk.service";
import type { RuntimeProcessManager } from "#lib/process-manager/process-manager.types";
import type {
  PuppeteerReceiptViewerLifecycle,
  PuppeteerStartupState,
} from "#lib/puppeteer/puppeteer.types";

export type TRPCContext = {
  adminOrigin: string;
  allowedHostnames: readonly string[];
  db: DB;
  /** Darkroom PIN and tokens, one per engine process. */
  darkroomAccess: DarkroomAccess;
  /** The `x-darkroom-token` header, when the Darkroom sent one. */
  darkroomToken?: string;
  /** Push channel to the connected kiosk pages, one per engine process. */
  kioskChannel: KioskChannel;
  /** Whether the booth is in maintenance, kept in SQLite. */
  kioskMaintenance: KioskMaintenance;
  mode: "development" | "production";
  requestOrigin?: string;
  processManager: RuntimeProcessManager;
  puppeteerLifecycle: PuppeteerReceiptViewerLifecycle;
  puppeteerState: PuppeteerStartupState;
  printerUSBAdapter?: USB;
  page?: Page;
};
