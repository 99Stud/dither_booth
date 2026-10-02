import { defineCommand } from "citty";

import type { BoothContext } from "#internal/context";

import { requireRoot } from "#internal/args";
import {
  SERVICE_NAME,
  SERVICE_PATH,
  SERVICE_USER,
  SSD_MOUNT_POINT,
} from "#internal/config";
import { buildBoothContext } from "#internal/context";
import { run } from "#internal/system";
import { heading, info, ok, runBoothTask, step } from "#internal/ui";

function buildUnit(repoRoot: string): string {
  const home = `/home/${SERVICE_USER}`;
  const bun = `${home}/.bun/bin/bun`;
  const onSsd =
    repoRoot === SSD_MOUNT_POINT || repoRoot.startsWith(`${SSD_MOUNT_POINT}/`);
  const requiresMount = onSsd ? `RequiresMountsFor=${SSD_MOUNT_POINT}\n` : "";

  // Official PM2 shape: a forking daemon, PID file, kill on stop. ExecStart
  // loads pm2.config.js instead of resurrecting ~/.pm2/dump.pm2. pm2-runtime
  // is a private god; `pm2 list` then spawns a second daemon.
  return `[Unit]
Description=Dither Booth kiosk services (PM2)
Documentation=https://pm2.keymetrics.io/docs/usage/startup/
After=network-online.target
Wants=network-online.target
${requiresMount}[Service]
Type=forking
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${repoRoot}
Environment=HOME=${home}
Environment=PM2_HOME=${home}/.pm2
Environment=NODE_ENV=production
Environment=PATH=${home}/.bun/bin:${repoRoot}/node_modules/.bin:/usr/local/bin:/usr/bin:/bin
PIDFile=${home}/.pm2/pm2.pid
ExecStart=${bun} run pm2:start
ExecReload=${bun} run pm2:reload
ExecStop=${bun} ./node_modules/pm2/bin/pm2 kill
Restart=on-failure
RestartSec=5
TimeoutStartSec=120
TimeoutStopSec=40
KillMode=mixed

[Install]
WantedBy=multi-user.target
`;
}

export async function runServiceCommand(context: BoothContext): Promise<void> {
  const { repoRoot } = context;

  heading("Install systemd service");

  const desiredUnit = buildUnit(repoRoot);
  const existing = await Bun.file(SERVICE_PATH)
    .text()
    .catch(() => undefined);

  if (existing === desiredUnit) {
    info(`${SERVICE_NAME} already present and up to date.`);
  } else {
    step(`${existing ? "Updating" : "Creating"} ${SERVICE_PATH}`);
    await Bun.write(SERVICE_PATH, desiredUnit);
  }

  step("Reloading systemd daemon");
  await run(["systemctl", "daemon-reload"]);

  step(`Enabling and starting ${SERVICE_NAME}`);
  await run(["systemctl", "enable", "--now", SERVICE_NAME]);

  ok(`${SERVICE_NAME} enabled`);
}

export default defineCommand({
  meta: {
    name: "service",
    description: "Install and enable the ditherbooth systemd service",
  },
  async setup() {
    requireRoot("service");
  },
  async run() {
    await runBoothTask(async () => {
      await runServiceCommand(buildBoothContext());
    });
  },
});
