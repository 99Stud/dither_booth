export interface RestartBudgetOptions {
  /** Restarts in a row before the camera is left failed. */
  limit: number;
  /** How long a picture must last before the budget fills up again. */
  stableMs: number;
}

/**
 * How many times a failing camera may still reopen by itself. A picture
 * refills the budget only once it has lasted `stableMs`: a camera that
 * draws a frame and dies right after must still run out, or it would
 * reopen forever.
 */
export const createRestartBudget = ({
  limit,
  stableMs,
}: RestartBudgetOptions) => {
  let used = 0;
  let refill: ReturnType<typeof setTimeout> | undefined;

  return {
    /** Spends one restart; false when none is left. Cancels a pending refill. */
    take() {
      clearTimeout(refill);

      if (used >= limit) return false;

      used += 1;
      return true;
    },
    /** The camera shows a picture: the budget refills if it lasts. */
    pictureShown() {
      clearTimeout(refill);
      refill = setTimeout(() => {
        used = 0;
      }, stableMs);
    },
    dispose() {
      clearTimeout(refill);
    },
  };
};
