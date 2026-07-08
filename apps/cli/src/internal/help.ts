import { colorize } from "#internal/color";
import { CLI_VERSION } from "#internal/config";

export function helpText(): string {
  const title = colorize("booth", "bold", "cyan");

  return `${title} - Dither Booth Raspberry Pi provisioning CLI (v${CLI_VERSION})

${colorize("Usage:", "bold")}
  booth <command> [options]

${colorize("Commands:", "bold")}
  install            Full first-time provisioning (runs every step below)
  bun                Install Bun runtime if missing
  repo               Clone/pull repo, install deps, build, reinstall Puppeteer
  ssd                Mount the SSD and relocate the database onto it
  db                 Apply database migrations and seed defaults
  cert [ip]          Generate the TLS certificate (auto-detects LAN IP)
  cert:copy          Print scp command to copy the root CA to your machine
  service            Install and enable the ditherbooth systemd service
  doctor             Run health checks on the booth

${colorize("Options:", "bold")}
  -y, --yes          Assume yes for destructive prompts (non-interactive)
      --color=WHEN   Color output: auto (default), always, never
      --no-banner    Do not print the startup banner
  -h, --help         Show this help
  -v, --version      Show version

${colorize("Environment:", "bold")}
  BOOTH_REPO         Override repo root (default /opt/dither-booth)
  BOOTH_REPO_URL     Override git clone URL
  BOOTH_SSD_DEVICE   Force SSD partition (e.g. /dev/sda1)
  BOOTH_SERVICE_USER Service/system user (default pi)
  BOOTH_NO_BANNER    Set to disable the banner
  NO_COLOR           Disable colored output (no-color.org)
`;
}
