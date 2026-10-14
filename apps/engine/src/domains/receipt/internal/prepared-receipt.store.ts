import type { PreparedReceiptJob } from "./receipt-print.service";

/**
 * Long enough to cover the slot machine plus a slow kiosk, short enough that
 * a visit abandoned mid-game does not pin two raster buffers in memory for
 * long. A job that outlives this is simply never printed.
 */
export const PREPARED_RECEIPT_TTL_MS = 120_000;

interface StoredJob {
  expiresAt: number;
  job: PreparedReceiptJob;
}

export const createPreparedReceiptStore = ({
  now = Date.now,
  ttlMs = PREPARED_RECEIPT_TTL_MS,
}: {
  now?: () => number;
  ttlMs?: number;
} = {}) => {
  const jobs = new Map<string, StoredJob>();

  const evictExpired = () => {
    const currentTime = now();

    for (const [ticketRef, stored] of jobs) {
      if (stored.expiresAt <= currentTime) jobs.delete(ticketRef);
    }
  };

  return {
    put(job: PreparedReceiptJob) {
      evictExpired();
      jobs.set(job.ticketRef, { expiresAt: now() + ttlMs, job });
    },
    take(ticketRef: string): PreparedReceiptJob | null {
      evictExpired();

      const stored = jobs.get(ticketRef);

      if (!stored) return null;

      jobs.delete(ticketRef);

      return stored.job;
    },
    get size() {
      evictExpired();

      return jobs.size;
    },
  };
};

export const preparedReceiptStore = createPreparedReceiptStore();
