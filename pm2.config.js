import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const bunInterpreter = resolve(repoRoot, "node_modules", ".bin", "bun");
const pm2LogDir = resolve(repoRoot, "logs", "pm2");

export const PM2_PROCESS_NAMES = {
  engine: "dither-booth-engine",
  admin: "dither-booth-admin",
  shutter: "dither-booth-shutter",
};

const sharedAppConfig = {
  args: ["dist/server.js"],
  autorestart: true,
  exec_mode: "fork",
  exp_backoff_restart_delay: 1000,
  instances: 1,
  interpreter: "none",
  // Covers the in-flight Puppeteer navigation wait plus browser close.
  // A shorter kill leaves the listener up and the next start hits EADDRINUSE.
  kill_timeout: 25000,
  max_restarts: 10,
  merge_logs: true,
  min_uptime: "10s",
  // One JSON envelope per stdout/stderr chunk: {message, timestamp, type,
  // process_id, app_name}. No `time`: it would swap the ISO timestamp for a
  // date format.
  log_type: "json",
  script: bunInterpreter,
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
  // stdout and stderr both go to the one combined file only; `type` tells
  // them apart. logrotate rotates it (`booth service`).
  error_file: "/dev/null",
  log_file: resolve(pm2LogDir, `${name}.log`),
  max_memory_restart,
  out_file: "/dev/null",
  env_production: {
    NODE_ENV: "production",
    PROCESS_MANAGER: "pm2",
    ...env_production,
  },
});

const assertSingleAdminInstance = (appConfig) => {
  if (appConfig.instances !== 1) {
    throw new Error(
      "Admin PM2 process must run with instances: 1 because PM2 restart locking is in-memory.",
    );
  }
};

const adminAppConfig = createAppConfig({
  appDirectory: "admin",
  max_memory_restart: "256M",
  name: PM2_PROCESS_NAMES.admin,
});

assertSingleAdminInstance(adminAppConfig);

export const apps = [
  createAppConfig({
    appDirectory: "engine",
    max_memory_restart: "1G",
    name: PM2_PROCESS_NAMES.engine,
  }),
  adminAppConfig,
  createAppConfig({
    appDirectory: "shutter",
    max_memory_restart: "256M",
    name: PM2_PROCESS_NAMES.shutter,
  }),
];

export default { apps };
