import type { DB } from "#db/internal/db.types";
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
import type { RuntimeProcessManager } from "#lib/process-manager/process-manager.types";
import type { PuppeteerReceiptViewerLifecycle } from "#lib/puppeteer/puppeteer.types";

/** Whether a request's `Origin` is the admin's, on any of the booth's names. */
export type AdminOrigins = {
  allows: (origin: string | undefined) => boolean;
};

/** Built once by `createEngine`; every request sees the same ones. */
export type EngineServices = {
  /** Opens `config.*` and `ops.*`. */
  adminOrigins: AdminOrigins;
  db: DB;
  /** Darkroom PIN and tokens. */
  darkroomAccess: DarkroomAccess;
  /** The booth's reports to the Hub. */
  hubReporter: HubReporter;
  /** Push channel to the connected kiosk pages. */
  kioskChannel: KioskChannel;
  /** Live views of the booth camera. */
  cameraPreview: CameraPreview;
  /** Whether the booth is in maintenance, and why. */
  kioskMaintenance: KioskMaintenance;
  mode: "development" | "production";
  /** NetworkManager, through `nmcli`, as the engine's user. */
  network: NetworkDeps;
  /** Opens `captive.*`: the token only the setup server can read. */
  setupServerAccess: SetupServerAccess;
  processManager: RuntimeProcessManager;
  puppeteerLifecycle: PuppeteerReceiptViewerLifecycle;
  /** The receipt printer, watched for as long as the engine runs. */
  printer: BoothPrinter;
  /** Every ticket rendered by the receipt viewer. */
  tickets: Tickets;
};

/** What a request carries that the access checks read. */
export type RequestCredentials = {
  /** The `Origin` header. */
  origin?: string;
  /** The `x-darkroom-token` header, when the Darkroom sent one. */
  darkroomToken?: string;
  /** The `x-setup-server-token` header, when the setup server sent one. */
  setupServerToken?: string;
};

export type TRPCContext = EngineServices & { request: RequestCredentials };
