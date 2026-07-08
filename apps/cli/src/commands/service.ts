import type { CommandContext } from "#internal/context";

import { SERVICE_NAME, SERVICE_PATH, SERVICE_USER } from "#internal/config";
import { run } from "#internal/system";
import { heading, info, ok, step } from "#internal/ui";

function buildUnit(repoRoot: string): string {
  // oneshot + RemainAfterExit wraps PM2: systemd triggers the PM2 process list
  // on boot. PATH is set explicitly because systemd does not load login shells.
  return `[Unit]
Description=Dither Booth kiosk services (PM2)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=${SERVICE_USER}
WorkingDirectory=${repoRoot}
Environment=PATH=/home/${SERVICE_USER}/.bun/bin:/usr/local/bin:/usr/bin:/bin
Environment=NODE_ENV=production
ExecStart=/bin/bash -lc 'bun run pm2:start && bun run pm2:save'
ExecStop=/bin/bash -lc 'bun run pm2:stop'

[Install]
WantedBy=multi-user.target
`;
}

export async function serviceCommand(context: CommandContext): Promise<void> {
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
