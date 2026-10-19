import { getWebTlsManifestPath } from "@dither-booth/ports";
import { defineCommand } from "citty";
import { chmod } from "node:fs/promises";

import type { BoothContext } from "#internal/context";

import { requireRoot } from "#internal/args";
import {
  BOOTH_BIN,
  NETWORK_DISPATCHER_PATH,
  SERVICE_BUN,
  SERVICE_BUN_DIR,
  SERVICE_HOME,
  SERVICE_NAME,
  SERVICE_PATH,
  SERVICE_USER,
  SSD_MOUNT_POINT,
} from "#internal/config";
import { buildBoothContext } from "#internal/context";
import { run } from "#internal/system";
import { heading, info, ok, runBoothTask, step } from "#internal/ui";

export function buildUnit(repoRoot: string): string {
  const home = SERVICE_HOME;
  const bun = SERVICE_BUN;
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
Environment=PATH=${SERVICE_BUN_DIR}:${repoRoot}/node_modules/.bin:/usr/local/bin:/usr/bin:/bin
Environment=BOOTH_REPO=${repoRoot}
PIDFile=${home}/.pm2/pm2.pid
# A booth plugged in on a new network gets a leaf certificate for its new
# address before the apps start. Same CA, so trusted iPads keep working.
# \`-\`: a failed re-issue still starts the booth on the old certificate.
ExecStartPre=-${BOOTH_BIN} cert --if-changed --no-banner --color=never
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

/**
 * NetworkManager runs this on every interface change. When the booth's
 * address no longer matches its certificate, it restarts the service, whose
 * ExecStartPre re-issues the certificate and whose apps re-read the address.
 */
export function buildNetworkDispatcher(repoRoot: string): string {
  const manifestPath = getWebTlsManifestPath({ repoRoot });

  return `#!/bin/sh
# Installed by \`booth service\`. Restarts ${SERVICE_NAME} when the booth's
# LAN IP stops matching its TLS certificate.
case "$2" in
  up|dhcp4-change) ;;
  *) exit 0 ;;
esac
[ "$1" = "lo" ] && exit 0

current=$(hostname -I 2>/dev/null | awk '{print $1}')
recorded=$(sed -n 's/.*"publicIp": *"\\([^"]*\\)".*/\\1/p' "${manifestPath}" 2>/dev/null)

if [ -n "$current" ] && [ "$current" != "$recorded" ]; then
  systemctl try-restart ${SERVICE_NAME}
fi
exit 0
`;
}

async function writeIfChanged(path: string, content: string): Promise<boolean> {
  const existing = await Bun.file(path)
    .text()
    .catch(() => undefined);

  if (existing === content) return false;

  step(`${existing ? "Updating" : "Creating"} ${path}`);
  await Bun.write(path, content);
  return true;
}

export async function runServiceCommand(context: BoothContext): Promise<void> {
  const { repoRoot } = context;

  heading("Install systemd service");

  if (!(await writeIfChanged(SERVICE_PATH, buildUnit(repoRoot)))) {
    info(`${SERVICE_NAME} already present and up to date.`);
  }

  await writeIfChanged(
    NETWORK_DISPATCHER_PATH,
    buildNetworkDispatcher(repoRoot),
  );
  // NetworkManager only runs dispatcher scripts that root owns and can execute.
  await chmod(NETWORK_DISPATCHER_PATH, 0o755);

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
