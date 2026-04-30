import { getTrpcProxyUpstreamPath } from "#lib/trpc/trpc-proxy.utils";
import { TRPC_PROXY_PATH } from "#lib/trpc/trpc.constants";
import {
  ADMIN_BIND_HOST,
  getApiInternalOrigin,
  getPort,
  getWebTlsCertPath,
  getWebTlsKeyPath,
} from "@dither-booth/ports";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const adminRoot = process.cwd();
const repoRoot = resolve(adminRoot, "../..");

const getHttpsOptions = () => {
  const tlsCertPath = getWebTlsCertPath({ repoRoot });
  const tlsKeyPath = getWebTlsKeyPath({ repoRoot });

  if (!existsSync(tlsCertPath) || !existsSync(tlsKeyPath)) {
    throw new Error(
      `Missing local TLS certificate. Run "bun run --filter @dither-booth/api cert:generate <LAN_IP>" to create ${tlsCertPath} and ${tlsKeyPath}.`,
    );
  }

  return {
    cert: readFileSync(tlsCertPath),
    key: readFileSync(tlsKeyPath),
  };
};

export default defineConfig(({ command }) => {
  const isServeCommand = command === "serve";

  return {
    plugins: [
      react(),
      babel({
        presets: [reactCompilerPreset()],
      }),
      tailwindcss(),
    ],
    server: isServeCommand
      ? {
          host: ADMIN_BIND_HOST,
          https: getHttpsOptions(),
          port: getPort("ADMIN_PORT"),
          strictPort: true,
          proxy: {
            [TRPC_PROXY_PATH]: {
              target: getApiInternalOrigin(),
              changeOrigin: true,
              rewrite: getTrpcProxyUpstreamPath,
            },
          },
        }
      : undefined,
    devtools: {
      enabled: true,
    },
  };
});
