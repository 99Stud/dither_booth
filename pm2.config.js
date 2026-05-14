import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const bunInterpreter = resolve(repoRoot, "node_modules", ".bin", "bun");
const pm2LogDir = resolve(repoRoot, "logs", "pm2");

export const PM2_PROCESS_NAMES = {
  api: "dither-booth-api",
  admin: "dither-booth-admin",
  web: "dither-booth-web",
};

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
    appDirectory: "api",
    max_memory_restart: "1G",
    name: PM2_PROCESS_NAMES.api,
  }),
  adminAppConfig,
  createAppConfig({
    appDirectory: "web",
    max_memory_restart: "256M",
    name: PM2_PROCESS_NAMES.web,
  }),
];

export default { apps };
