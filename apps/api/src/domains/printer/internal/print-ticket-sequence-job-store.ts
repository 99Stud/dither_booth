import { randomUUID } from "node:crypto";

/** Matches `printTicketSequenceInputSchema` (large POST body — never send via SSE URL). */
export type PrintTicketSequenceJobPayload = {
  receiptImage: string;
  lotteryTicketImage: string;
  clientFlowId?: string;
};

const JOB_TTL_MS = 15 * 60 * 1000;

const jobs = new Map<
  string,
  {
    input: PrintTicketSequenceJobPayload;
    expiresAt: number;
  }
>();

export const registerPrintTicketSequenceJob = (
  input: PrintTicketSequenceJobPayload,
): string => {
  const jobId = randomUUID();
  const expiresAt = Date.now() + JOB_TTL_MS;
  jobs.set(jobId, { input, expiresAt });
  setTimeout(() => {
    jobs.delete(jobId);
  }, JOB_TTL_MS);
  return jobId;
};

export const takePrintTicketSequenceJob = (
  jobId: string,
): PrintTicketSequenceJobPayload | null => {
  const row = jobs.get(jobId);
  if (!row) {
    return null;
  }
  jobs.delete(jobId);
  if (Date.now() > row.expiresAt) {
    return null;
  }
  return row.input;
};
