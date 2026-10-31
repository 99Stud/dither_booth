import type { Page } from "puppeteer";

import type { DB } from "#db/internal/db.types";
import type { EventBackups } from "#domains/backup/backup.service";
import type { SetupServerAccess } from "#domains/captive/captive.service";
import type { DarkroomAccess } from "#domains/darkroom/darkroom.service";
import type { HubReporter } from "#domains/hub/hub.service";
import type {
  CameraPreview,
  KioskChannel,
  KioskMaintenance,
} from "#domains/kiosk/kiosk.service";
import type { NetworkDeps } from "#domains/network/network.service";
import type { BoothPrinter } from "#domains/printer/printer.service";
import type { Tickets } from "#domains/receipt/receipt.service";
import type { Visits } from "#domains/visit/visit.service";
import type { RuntimeProcessManager } from "#lib/process-manager/process-manager.types";
import type {
  PuppeteerReceiptViewerLifecycle,
  PuppeteerStartupState,
} from "#lib/puppeteer/puppeteer.types";

export type TRPCContext = {
  adminOrigin: string;
  allowedHostnames: readonly string[];
  db: DB;
  /** The staff PIN and its tokens, one per engine process. */
  darkroomAccess: DarkroomAccess;
  /**
   * The `x-darkroom-token` header: the Darkroom sends it, the admin server
   * adds it from its session cookie.
   */
  darkroomToken?: string;
  /** The database's backups while the engine runs, one per engine process. */
  eventBackups: EventBackups;
  /** The booth's reports to the Hub, one per engine process. */
  hubReporter: HubReporter;
  /** Push channel to the connected kiosk pages, one per engine process. */
  kioskChannel: KioskChannel;
  /** Live views of the booth camera, one registry per engine process. */
  cameraPreview: CameraPreview;
  /** Whether the booth is in maintenance, and why. */
  kioskMaintenance: KioskMaintenance;
  /** The release this engine runs (`readRelease`), read once at start. */
  release: string;
  mode: "development" | "production";
  /** NetworkManager, through `nmcli`, as the engine's user. */
  network: NetworkDeps;
  requestOrigin?: string;
  /** Opens `captive.*`: the token only the setup server can read. */
  setupServerAccess: SetupServerAccess;
  /** The `x-setup-server-token` header, when the setup server sent one. */
  setupServerToken?: string;
  processManager: RuntimeProcessManager;
  puppeteerLifecycle: PuppeteerReceiptViewerLifecycle;
  puppeteerState: PuppeteerStartupState;
  /** The receipt printer, watched for as long as the engine runs. */
  printer: BoothPrinter;
  /** Every ticket rendered by the receipt viewer, one per engine process. */
  tickets: Tickets;
  /** Each guest's visit, recorded for the event's counts. */
  visits: Visits;
  page?: Page;
};
