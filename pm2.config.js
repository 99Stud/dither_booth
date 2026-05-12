import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const bunInterpreter = resolve(repoRoot, "node_modules", ".bin", "bun");
const pm2LogDir = resolve(repoRoot, "logs", "pm2");

const sharedAppConfig = {
  args: ["dist/server.js"],
  autorestart: true,
  exec_mode: "fork",
  exp_backoff_restart_delay: 1000,
  instances: 1,
  interpreter: "none",
  kill_timeout: 5000,
  max_restarts: 10,
  merge_logs: true,
  min_uptime: "10s",
  script: bunInterpreter,
  time: true,
  watch: false,
};

const createAppConfig = ({
  appDirectory,
  env_production = {},
  max_memory_restart,
  name,
}) => ({
  ...sharedAppConfig,
  name,
  cwd: resolve(repoRoot, "apps", appDirectory),
  error_file: resolve(pm2LogDir, `${name}-err.log`),
  max_memory_restart,
  out_file: resolve(pm2LogDir, `${name}-out.log`),
  env_production: {
    NODE_ENV: "production",
    ...env_production,
  },
});

export const apps = [
  createAppConfig({
    appDirectory: "api",
    max_memory_restart: "1G",
    name: "dither-booth-api",
  }),
  createAppConfig({
    appDirectory: "admin",
    max_memory_restart: "256M",
    name: "dither-booth-admin",
  }),
  createAppConfig({
    appDirectory: "web",
    max_memory_restart: "256M",
    name: "dither-booth-web",
  }),
];

export default { apps };
