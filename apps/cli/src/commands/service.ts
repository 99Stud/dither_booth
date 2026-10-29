import { BOOTH_WIFI_IP, getWebTlsManifestPath } from "@dither-booth/ports";
import {
  PM2_LOG_RELATIVE_DIR,
  PM2_PROCESS_NAMES,
} from "@dither-booth/shared/booth-system";
import {
  boothRollbackModeSchema,
  getBoothRollbackUnit,
} from "@dither-booth/shared/booth-update";
import { defineCommand } from "citty";
import { chmod, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import type { BoothContext } from "#internal/context";

import { requireRoot } from "#internal/args";
import {
  BOOTH_BIN,
  JOURNAL_GROUP,
  LOGROTATE_MAX_SIZE_MB,
  LOGROTATE_RULE_PATH,
  LOGROTATE_TIMER_DROP_IN_PATH,
  NETWORK_DISPATCHER_PATH,
  SERVICE_BUN,
  SERVICE_BUN_DIR,
  SERVICE_HOME,
  SERVICE_NAME,
  SERVICE_PATH,
  SERVICE_USER,
  SSD_MOUNT_POINT,
  ROLLBACK_UNIT_PATH,
  SYSTEM_POLKIT_RULE_PATH,
  UPDATE_UNIT_PATH,
} from "#internal/config";
import { buildBoothContext } from "#internal/context";
import { capture, run } from "#internal/system";
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
# An update a power cut or a crash interrupted after its switch goes back
# before the apps start. As root (\`+\`): it moves /opt/dither-booth.
ExecStartPre=-+${BOOTH_BIN} update --recover --no-restart --no-banner --color=never
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
# The booth Wi-Fi's address is in every certificate: nothing to re-issue.
[ "$current" = "${BOOTH_WIFI_IP}" ] && exit 0
recorded=$(sed -n 's/.*"publicIp": *"\\([^"]*\\)".*/\\1/p' "${manifestPath}" 2>/dev/null)

if [ -n "$current" ] && [ "$current" != "$recorded" ]; then
  systemctl try-restart ${SERVICE_NAME}
fi
exit 0
`;
}

/**
 * PM2 never rotates its files. logrotate copies then truncates each one, so
 * PM2 keeps writing through the handle it already holds. `maxsize` rotates a
 * file over 20 MB even when it was already rotated that day, checked each
 * time logrotate.timer runs: hourly, with the drop-in below.
 * Files are named, not globbed: the old `-out.log`/`-err.log` stay as they are.
 */
export function buildLogrotateRule(repoRoot: string): string {
  const files = Object.values(PM2_PROCESS_NAMES)
    .map((name) => `${repoRoot}/${PM2_LOG_RELATIVE_DIR}/${name}.log`)
    .join("\n");

  return `# Installed by \`booth service\`. Rotates the PM2 log files.
${files}
{
  su ${SERVICE_USER} ${SERVICE_USER}
  daily
  maxsize ${LOGROTATE_MAX_SIZE_MB}M
  rotate 7
  compress
  copytruncate
  missingok
  notifempty
}
`;
}

/**
 * Debian runs logrotate once a day, so `maxsize` alone lets a noisy day's
 * log grow far past it. This drop-in runs it every hour; `daily` rules
 * still rotate once a day, and a file past the cap within the hour.
 */
export function buildLogrotateTimerDropIn(): string {
  return `# Installed by \`booth service\`. Runs logrotate hourly, so the PM2 logs'
# ${LOGROTATE_MAX_SIZE_MB} MB cap is checked every hour, not once a day.
[Timer]
OnCalendar=
OnCalendar=hourly
`;
}

/** One per rollback mode, as the admin starts them. */
const ROLLBACK_UNITS =
  boothRollbackModeSchema.options.map(getBoothRollbackUnit);

/**
 * The admin's System page runs `systemctl` as the service user: restart
 * this unit, reboot, power off, and start an update or a rollback unit.
 * Nothing else: not other units, not stop. The update instance must be a
 * release version (systemd writes its `-` as `\x2d`); the CLI checks it
 * again. The `-multiple-sessions` actions are what logind asks while
 * someone is logged in over SSH. polkit reads the rules folder again on
 * its own.
 */
export function buildSystemPolkitRule(): string {
  return `// Installed by \`booth service\`.
polkit.addRule(function (action, subject) {
  if (subject.user !== "${SERVICE_USER}") {
    return polkit.Result.NOT_HANDLED;
  }
  if (
    action.id === "org.freedesktop.systemd1.manage-units" &&
    action.lookup("unit") === "${SERVICE_NAME}" &&
    action.lookup("verb") === "restart"
  ) {
    return polkit.Result.YES;
  }
  if (
    action.id === "org.freedesktop.systemd1.manage-units" &&
    action.lookup("verb") === "start" &&
    (/^ditherbooth-update@[0-9]+\\.[0-9]+\\.[0-9]+(\\\\x2d[0-9A-Za-z.]+)?\\.service$/.test(
      action.lookup("unit"),
    ) ||
      ${JSON.stringify(ROLLBACK_UNITS)}.indexOf(action.lookup("unit")) >= 0)
  ) {
    return polkit.Result.YES;
  }
  if (
    action.id === "org.freedesktop.login1.reboot" ||
    action.id === "org.freedesktop.login1.reboot-multiple-sessions" ||
    action.id === "org.freedesktop.login1.power-off" ||
    action.id === "org.freedesktop.login1.power-off-multiple-sessions"
  ) {
    return polkit.Result.YES;
  }
  return polkit.Result.NOT_HANDLED;
});
`;
}

/**
 * `booth update <version>` as root, in a unit of its own: it restarts
 * PM2, and the admin that asked with it, and must outlive both. One run
 * per version at a time; the CLI's lock stops two versions at once.
 */
export function buildUpdateUnit(): string {
  return `[Unit]
Description=Dither Booth update to %I
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${BOOTH_BIN} update %I --no-banner --color=never
# However the job's process ended (the new CLI dying after the handover,
# this unit's timeout, an out-of-memory kill), an unfinished job is ended
# here: back to the release before if it had switched.
ExecStopPost=${BOOTH_BIN} update --recover --no-banner --color=never
# The booth keeps serving while the update downloads and unpacks.
Nice=10
IOSchedulingClass=idle
TimeoutStartSec=45min
# ExecStopPost goes back on the release before: a stop, a start and a
# 2 min check. The 90 s default would cut it short.
TimeoutStopSec=5min
`;
}

/** `booth rollback` as root; the instance is keep-db or restore-db. */
export function buildRollbackUnit(): string {
  return `[Unit]
Description=Dither Booth rollback (%I)

[Service]
Type=oneshot
ExecStart=${BOOTH_BIN} rollback --mode %I --no-banner --color=never
TimeoutStartSec=15min
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

async function isActive(unit: string): Promise<boolean> {
  const active = await capture(["systemctl", "is-active", unit], {
    allowFailure: true,
  });

  return active.stdout.trim() === "active";
}

/** True when the service user was added now, false when already a member. */
async function joinJournalGroup(): Promise<boolean> {
  const groups = await capture(["id", "-nG", SERVICE_USER], {
    allowFailure: true,
  });

  if (groups.stdout.trim().split(/\s+/).includes(JOURNAL_GROUP)) return false;

  step(`Adding ${SERVICE_USER} to ${JOURNAL_GROUP}`);
  await run(["usermod", "-aG", JOURNAL_GROUP, SERVICE_USER]);
  return true;
}

export async function runServiceCommand(
  context: BoothContext,
  {
    restart = true,
  }: {
    /** False from `booth update`, which restarts the booth itself next. */
    restart?: boolean;
  } = {},
): Promise<void> {
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

  await writeIfChanged(LOGROTATE_RULE_PATH, buildLogrotateRule(repoRoot));
  // logrotate skips a rule that the group or others can write.
  await chmod(LOGROTATE_RULE_PATH, 0o644);

  await mkdir(dirname(LOGROTATE_TIMER_DROP_IN_PATH), { recursive: true });
  // Picked up by the daemon-reload below.
  await writeIfChanged(
    LOGROTATE_TIMER_DROP_IN_PATH,
    buildLogrotateTimerDropIn(),
  );

  await writeIfChanged(UPDATE_UNIT_PATH, buildUpdateUnit());
  await writeIfChanged(ROLLBACK_UNIT_PATH, buildRollbackUnit());
  await writeIfChanged(SYSTEM_POLKIT_RULE_PATH, buildSystemPolkitRule());
  await chmod(SYSTEM_POLKIT_RULE_PATH, 0o644);

  const wasActive = await isActive(SERVICE_NAME);
  const joinedJournal = await joinJournalGroup();

  step("Reloading systemd daemon");
  await run(["systemctl", "daemon-reload"]);

  step(`Enabling and starting ${SERVICE_NAME}`);
  await run(["systemctl", "enable", "--now", SERVICE_NAME]);

  // A running process keeps the groups it started with.
  if (restart && wasActive && joinedJournal) {
    step(`Restarting ${SERVICE_NAME} so it can read the system journal`);
    await run(["systemctl", "restart", SERVICE_NAME]);
  }

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
