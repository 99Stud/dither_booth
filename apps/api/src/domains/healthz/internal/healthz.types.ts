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

export type DependencyHealthzPayload = {
  ok: boolean;
  message?: string;
  details?: object;
};

export type PuppeteerRuntimeCheckHealthz<TDetails extends object = never> = {
  ok: boolean;
  message?: string;
} & ([TDetails] extends [never]
  ? object
  : {
      details?: TDetails;
    });

export type PuppeteerRuntimeDocumentDetails =
  | {
      readyState: string;
    }
  | {
      expectedReadyState: "complete";
      readyState: string;
    }
  | {
      error: string;
    };

export type PuppeteerRuntimeUrlDetails =
  | {
      currentPath: string;
      currentUrl: string;
      expectedPath: string;
    }
  | {
      currentUrl: string;
      error: string;
      expectedPath: string;
    };

export type PuppeteerRuntimeCheckMap = {
  browser: PuppeteerRuntimeCheckHealthz;
  document: PuppeteerRuntimeCheckHealthz<PuppeteerRuntimeDocumentDetails>;
  page: PuppeteerRuntimeCheckHealthz;
  url: PuppeteerRuntimeCheckHealthz<PuppeteerRuntimeUrlDetails>;
};

export type PrinterDependencyHealthz = ReturnType<
  typeof checkPrinterDependency
>;
