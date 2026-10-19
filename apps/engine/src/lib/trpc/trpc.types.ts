import type { Page } from "puppeteer";

import type { DB } from "#db/internal/db.types";
import type { DarkroomAccess } from "#domains/darkroom/darkroom.service";
import type {
  CameraPreview,
  KioskChannel,
  KioskMaintenance,
} from "#domains/kiosk/kiosk.service";
import type { NetworkDeps } from "#domains/network/network.service";
import type { BoothPrinter } from "#domains/printer/printer.service";
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
  /** Live views of the booth camera, one registry per engine process. */
  cameraPreview: CameraPreview;
  /** Whether the booth is in maintenance, and why. */
  kioskMaintenance: KioskMaintenance;
  mode: "development" | "production";
  /** NetworkManager, through `nmcli`, as the engine's user. */
  network: NetworkDeps;
  requestOrigin?: string;
  processManager: RuntimeProcessManager;
  puppeteerLifecycle: PuppeteerReceiptViewerLifecycle;
  puppeteerState: PuppeteerStartupState;
  /** The receipt printer, watched for as long as the engine runs. */
  printer: BoothPrinter;
  page?: Page;
};
