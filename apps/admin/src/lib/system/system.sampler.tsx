import type {
  SystemHistory,
  SystemSample,
  SystemSnapshot,
} from "./system.protocol";
import type { SystemReader } from "./system.reader";

import {
  SYSTEM_HISTORY_SAMPLES,
  SYSTEM_SAMPLE_INTERVAL_MS,
} from "./system.constants";
import { freePercent } from "./system.utils";

/*
 * Reads the Pi on a timer and keeps the last hour, so the page has its
 * charts the moment it opens and one reader serves every open tab.
 */

export type SystemSampler = {
  /** The latest sample with its history. Waits for the first read. */
  snapshot: () => Promise<SystemSnapshot>;
  stop: () => void;
};

/** Thrown when the first read failed and there is nothing to show yet. */
export class SystemNotSampledError extends Error {
  constructor() {
    super("The Pi hasn't been read yet.");
    this.name = "SystemNotSampledError";
  }
}

export function createSystemSampler({
  reader,
  intervalMs = SYSTEM_SAMPLE_INTERVAL_MS,
  capacity = SYSTEM_HISTORY_SAMPLES,
  now = () => Date.now(),
  onError,
}: {
  reader: SystemReader;
  intervalMs?: number;
  capacity?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
}): SystemSampler {
  const history: SystemHistory = {
    t: [],
    celsius: [],
    availablePercent: [],
    cpuPercent: [],
  };
  let latest: { sample: SystemSample; at: number } | undefined;
  let inFlight: Promise<void> | undefined;

  const push = (sample: SystemSample, at: number) => {
    history.t.push(at);
    history.celsius.push(sample.thermal.celsius);
    history.availablePercent.push(
      sample.memory.availableBytes === null
        ? null
        : freePercent(sample.memory.availableBytes, sample.memory.totalBytes),
    );
    history.cpuPercent.push(sample.cpu.usagePercent);

    if (history.t.length > capacity) {
      for (const series of Object.values(history)) {
        series.splice(0, series.length - capacity);
      }
    }
  };

  const takeSample = () => {
    // A slow `vcgencmd` must not pile up reads.
    if (inFlight) {
      return inFlight;
    }

    // A reader that throws before it awaits is a failed read like any other.
    inFlight = Promise.resolve()
      .then(() => reader.sample())
      .then((sample) => {
        const at = now();

        latest = { sample, at };
        push(sample, at);
      })
      .catch((error: unknown) => onError?.(error))
      .finally(() => {
        inFlight = undefined;
      });

    return inFlight;
  };

  const first = takeSample();
  const timer = setInterval(() => void takeSample(), intervalMs);

  timer.unref?.();

  return {
    async snapshot() {
      await first;

      if (!latest) {
        throw new SystemNotSampledError();
      }

      return {
        ...latest.sample,
        ageMs: Math.max(0, now() - latest.at),
        history: {
          t: [...history.t],
          celsius: [...history.celsius],
          availablePercent: [...history.availablePercent],
          cpuPercent: [...history.cpuPercent],
        },
      };
    },
    stop() {
      clearInterval(timer);
    },
  };
}
