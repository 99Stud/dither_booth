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

  // pm2-runtime stays in the foreground (PM2's container mode). The stock
  // systemd template daemonizes and resurrects ~/.pm2/dump.pm2, which is the
  // wrong source of truth here and races the PID file on a slow Pi.
  return `[Unit]
Description=Dither Booth kiosk services (PM2)
Documentation=https://pm2.keymetrics.io/docs/usage/docker-pm2-nodejs/
After=network-online.target
Wants=network-online.target
${requiresMount}[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${repoRoot}
Environment=HOME=${home}
Environment=PM2_HOME=${home}/.pm2
Environment=NODE_ENV=production
Environment=PATH=${home}/.bun/bin:${repoRoot}/node_modules/.bin:/usr/local/bin:/usr/bin:/bin
ExecStart=${bun} run pm2:runtime
ExecReload=${bun} run pm2:reload
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
