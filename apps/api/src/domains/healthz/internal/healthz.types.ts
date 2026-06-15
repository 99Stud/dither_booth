import type z from "zod";

import type {
  apiHealthzPayloadSchema,
  healthzModeSchema,
  webHealthzPayloadSchema,
} from "./healthz.constants";
import type { checkPrinterDependency } from "./healthz.printer";

export type HealthzMode = z.infer<typeof healthzModeSchema>;
export type ApiHealthzPayload = z.infer<typeof apiHealthzPayloadSchema>;
export type WebHealthzPayload = z.infer<typeof webHealthzPayloadSchema>;
export type HealthzPayload = ApiHealthzPayload | WebHealthzPayload;

export type Timestamped<TPayload extends object> = TPayload & {
  timestamp: string;
};

export type HealthzError<TContext extends object = Record<string, never>> = {
  message: string;
  cause?: string;
  context?: TContext;
};

export type HealthzCheck<
  TDetails extends object = Record<string, never>,
  TErrorContext extends object = Record<string, never>,
> =
  | {
      ok: true;
      details?: TDetails;
    }
  | {
      ok: false;
      message: string;
      error: HealthzError<TErrorContext>;
      details?: TDetails;
    };

export type DependencyHealthzPayload = {
  ok: boolean;
  message?: string;
  details?: object;
  error?: HealthzError<object>;
};

export type PuppeteerRuntimeCheckHealthz<
  TDetails extends object = Record<string, never>,
> = HealthzCheck<TDetails, TDetails>;

export type PuppeteerRuntimeDocumentDetails =
  | {
      expectedReadyState: "complete";
      readyState: string;
    }
  | {
      readyState: string;
    };

export type PuppeteerRuntimeUrlDetails = {
  currentPath?: string;
  currentUrl: string;
  expectedPath: string;
};

export type PuppeteerRuntimeClientRouteStatus = "error" | "not-found" | "ready";

export type PuppeteerRuntimeClientRouteDetails = {
  currentPath?: string;
  currentUrl: string;
  status?: PuppeteerRuntimeClientRouteStatus;
  statuses: string[];
};

export type PuppeteerRuntimeCheckMap = {
  browser: PuppeteerRuntimeCheckHealthz;
  clientRoute: PuppeteerRuntimeCheckHealthz<PuppeteerRuntimeClientRouteDetails>;
  document: PuppeteerRuntimeCheckHealthz<PuppeteerRuntimeDocumentDetails>;
  page: PuppeteerRuntimeCheckHealthz;
  url: PuppeteerRuntimeCheckHealthz<PuppeteerRuntimeUrlDetails>;
};

export type PrinterDependencyHealthz = ReturnType<
  typeof checkPrinterDependency
>;
