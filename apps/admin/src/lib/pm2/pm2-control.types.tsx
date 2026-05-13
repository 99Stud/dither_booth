import type pm2 from "pm2";

import z from "zod";

import type {
  pm2RestartFailureCodeSchema,
  pm2RestartProcessNamesSchema,
  pm2RestartProcessStatusSchema,
  pm2RestartProgressEventSchema,
  pm2RestartResultSchema,
  pm2RestartServiceSchema,
} from "./pm2-control.constants";

export type Pm2Client = typeof pm2;

export type Pm2RestartProcessNames = z.infer<
  typeof pm2RestartProcessNamesSchema
>;

export type Pm2RestartService = z.infer<typeof pm2RestartServiceSchema>;

export type Pm2RestartFailureCode = z.infer<typeof pm2RestartFailureCodeSchema>;

export type Pm2RestartResult = z.infer<typeof pm2RestartResultSchema>;

export type Pm2RestartProgressEvent = z.infer<
  typeof pm2RestartProgressEventSchema
>;

export type RestartPm2Service = (options: {
  onProgress?: Pm2RestartProgressReporter;
  service: Pm2RestartService;
}) => Promise<Pm2RestartResult>;

export type ReconcileRestartStatus = (options: {
  processName: string;
  service: Pm2RestartService;
}) => Promise<Pm2RestartProcessStatus>;

export type RestartLogContext = {
  restartId: string;
  service: Pm2RestartService;
  startedAtMs: number;
};

export type Pm2RestartProgressReporter = (
  event: Pm2RestartProgressEvent,
) => void | Promise<void>;

export type Pm2RestartPhase = "connect" | "restart" | "status";

export type Pm2RestartProcessStatus = z.infer<
  typeof pm2RestartProcessStatusSchema
>;
