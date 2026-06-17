export type ServerMode = "development" | "production";

export const hasDetails = (details?: object) => {
  return details !== undefined && Object.keys(details).length > 0;
};

export const getValueType = (value: unknown) => {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (value instanceof Error) {
    return "error";
  }

  return typeof value;
};

function getRuntimeNodeEnv() {
  const runtime = globalThis as {
    Bun?: { env?: { NODE_ENV?: string } };
    process?: { env?: { NODE_ENV?: string } };
  };

  return runtime.Bun?.env?.NODE_ENV ?? runtime.process?.env?.NODE_ENV;
}

export function assertNonProductionNodeEnvForDevelopmentMode({
  mode,
  nodeEnv = getRuntimeNodeEnv(),
  serverName,
}: {
  mode: ServerMode;
  nodeEnv?: string;
  serverName: string;
}) {
  if (mode === "development" && nodeEnv === "production") {
    throw new Error(
      `${serverName}: development mode must not run with NODE_ENV=production`,
    );
  }
}
