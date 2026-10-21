export type LotteryForceConfig =
  | { outcome: "loss" }
  | { outcome: "win"; prizeId: string };

function readEnv(name: string, env: Record<string, string | undefined>) {
  const value = env[name];

  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
}

function isTruthyEnvFlag(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function assertDevOnlyFlag(flagName: string, nodeEnv: string | undefined) {
  if (nodeEnv === "production") {
    throw new Error(`${flagName} must not be enabled when NODE_ENV=production`);
  }
}

export function parseReceiptPrintDryRun({
  nodeEnv,
  value,
}: {
  nodeEnv?: string;
  value?: string;
}): boolean {
  if (!isTruthyEnvFlag(value)) {
    return false;
  }

  assertDevOnlyFlag("RECEIPT_PRINT_DRY_RUN", nodeEnv);

  return true;
}

export function parseLotteryForceConfig({
  nodeEnv,
  outcome,
  prizeId,
}: {
  nodeEnv?: string;
  outcome?: string;
  prizeId?: string;
}): LotteryForceConfig | null {
  const normalizedOutcome = outcome?.trim().toLowerCase();
  const normalizedPrizeId = prizeId?.trim();

  if (!normalizedOutcome && !normalizedPrizeId) {
    return null;
  }

  if (normalizedOutcome || normalizedPrizeId) {
    assertDevOnlyFlag(
      normalizedOutcome ? "LOTTERY_FORCE_OUTCOME" : "LOTTERY_FORCE_PRIZE_ID",
      nodeEnv,
    );
  }

  if (
    normalizedOutcome &&
    normalizedOutcome !== "win" &&
    normalizedOutcome !== "loss"
  ) {
    throw new Error(
      `LOTTERY_FORCE_OUTCOME must be "win" or "loss" (received "${outcome}")`,
    );
  }

  if (normalizedOutcome === "loss") {
    if (normalizedPrizeId) {
      throw new Error(
        "LOTTERY_FORCE_PRIZE_ID cannot be set when LOTTERY_FORCE_OUTCOME=loss",
      );
    }

    return { outcome: "loss" };
  }

  if (!normalizedPrizeId) {
    throw new Error(
      "LOTTERY_FORCE_PRIZE_ID is required when forcing a lottery win",
    );
  }

  return { outcome: "win", prizeId: normalizedPrizeId };
}

/** Another Hub than production, such as the local stack. Dev only. */
export type HubOverride = { url: string; publishableKey: string };

export function parseHubOverride({
  nodeEnv,
  url,
  publishableKey,
}: {
  nodeEnv?: string;
  url?: string;
  publishableKey?: string;
}): HubOverride | null {
  if (!url && !publishableKey) {
    return null;
  }

  assertDevOnlyFlag("HUB_URL", nodeEnv);

  if (!url || !publishableKey) {
    throw new Error("HUB_URL and HUB_PUBLISHABLE_KEY must be set together");
  }

  return { url, publishableKey };
}

export function isReceiptPrintDryRun(
  env: Record<string, string | undefined> = Bun.env,
): boolean {
  return parseReceiptPrintDryRun({
    nodeEnv: readEnv("NODE_ENV", env),
    value: readEnv("RECEIPT_PRINT_DRY_RUN", env),
  });
}

export function getLotteryForceConfig(
  env: Record<string, string | undefined> = Bun.env,
): LotteryForceConfig | null {
  return parseLotteryForceConfig({
    nodeEnv: readEnv("NODE_ENV", env),
    outcome: readEnv("LOTTERY_FORCE_OUTCOME", env),
    prizeId: readEnv("LOTTERY_FORCE_PRIZE_ID", env),
  });
}

export function getHubOverride(
  env: Record<string, string | undefined> = Bun.env,
): HubOverride | null {
  return parseHubOverride({
    nodeEnv: readEnv("NODE_ENV", env),
    url: readEnv("HUB_URL", env),
    publishableKey: readEnv("HUB_PUBLISHABLE_KEY", env),
  });
}
