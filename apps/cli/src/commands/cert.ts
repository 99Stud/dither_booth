import {
  BOOTH_WIFI_IP,
  getWebPublicIp,
  getWebTlsCertPath,
} from "@dither-booth/ports";
import { defineCommand } from "citty";
import { X509Certificate } from "node:crypto";

import type { BoothContext } from "#internal/context";

import { SERVICE_USER } from "#internal/config";
import { buildBoothContext } from "#internal/context";
import {
  asServiceUser,
  capture,
  detectLanIp,
  run,
  serviceBun,
  SilentExit,
} from "#internal/system";
import {
  command,
  fail,
  heading,
  info,
  ok,
  plain,
  runBoothTask,
  step,
} from "#internal/ui";

/**
 * Whether the booth needs a new leaf certificate: only when it has none, its
 * address on a venue network changed, or it predates the booth Wi-Fi's
 * address. The CA stays, so devices that trust it keep working. On the booth
 * Wi-Fi nothing changes: the certificate already covers it.
 */
export function needsNewCertificate(options: {
  certificateIp: string | undefined;
  hasCertificate: boolean;
  coversBoothWifi: boolean;
  lanIp: string;
}): boolean {
  if (
    !options.hasCertificate ||
    !options.certificateIp ||
    !options.coversBoothWifi
  ) {
    return true;
  }
  return (
    options.lanIp !== BOOTH_WIFI_IP && options.certificateIp !== options.lanIp
  );
}

async function certificateCoversBoothWifi(certPath: string) {
  const pem = await Bun.file(certPath)
    .text()
    .catch(() => undefined);
  if (!pem) return false;

  try {
    return (new X509Certificate(pem).subjectAltName ?? "")
      .split(", ")
      .includes(`IP Address:${BOOTH_WIFI_IP}`);
  } catch {
    return false;
  }
}

export async function runCertCommand(
  context: BoothContext,
  { ifChanged = false }: { ifChanged?: boolean } = {},
): Promise<void> {
  const { repoRoot } = context;

  heading("Generate TLS certificate");

  const ip = context.ip ?? (await detectLanIp());

  if (!ip) {
    if (ifChanged) {
      // No network yet: keep the current certificate rather than fail the boot.
      info("No LAN IP yet; keeping the current certificate.");
      return;
    }
    fail(
      "Could not determine LAN IP. Pass it explicitly: `booth cert generate <LAN_IP>`.",
    );
    throw new SilentExit(1);
  }

  const certificateIp = await getWebPublicIp({ repoRoot }).catch(
    () => undefined,
  );

  if (ifChanged) {
    const certPath = getWebTlsCertPath({ repoRoot });
    const hasCertificate = await Bun.file(certPath).exists();
    const coversBoothWifi = await certificateCoversBoothWifi(certPath);

    if (
      !needsNewCertificate({
        certificateIp,
        coversBoothWifi,
        hasCertificate,
        lanIp: ip,
      })
    ) {
      ok(`Certificate already covers ${ip}`);
      return;
    }
  }

  // On the booth Wi-Fi, keep the venue address the booth last had: the
  // booth Wi-Fi's own is in every certificate anyway.
  const publicIp = ip === BOOTH_WIFI_IP && certificateIp ? certificateIp : ip;

  step(`Generating certificate for ${publicIp}`);
  await run(
    serviceBun([
      "run",
      "--filter",
      "@dither-booth/engine",
      "cert:generate",
      publicIp,
      ...(ifChanged ? ["--skip-install"] : []),
    ]),
    { cwd: repoRoot },
  );

  ok(`Certificate generated for ${publicIp} and the booth Wi-Fi`);
}

// Prints a ready-to-paste scp command so the operator can copy the mkcert root
// CA from this Pi to their own machine and trust it.
export async function runCertCopyCommand(context: BoothContext): Promise<void> {
  heading("Copy root CA to your machine");

  // The CA lives in the service user's home, where `cert generate` made it.
  const caroot = await capture(asServiceUser(["mkcert", "-CAROOT"]), {
    allowFailure: true,
  });

  if (caroot.exitCode !== 0) {
    fail("mkcert is not available. Install it, then re-run `booth cert copy`.");
    throw new SilentExit(1);
  }

  const rootCaPath = `${caroot.stdout.trim()}/rootCA.pem`;
  const serverIp = context.ip ?? (await detectLanIp()) ?? "<PI_LAN_IP>";

  info(`Root CA on this Pi: ${rootCaPath}`);
  plain("");
  plain("Run this on YOUR computer to copy and then trust the root CA:");
  plain("");
  plain(
    `  ${command(`scp ${SERVICE_USER}@${serverIp}:${rootCaPath} ./rootCA.pem`)}`,
  );
  plain("");
  plain("Then trust ./rootCA.pem in your OS/browser certificate store.");

  ok("Copy command ready");
}

const certGenerateCommand = defineCommand({
  meta: {
    name: "generate",
    description: "Generate the TLS certificate (auto-detects LAN IP)",
  },
  args: {
    ip: {
      type: "positional",
      description: "LAN IP for the certificate (auto-detected when omitted)",
      required: false,
    },
    ifChanged: {
      type: "boolean",
      description:
        "Only re-issue when the LAN IP changed (keeps the CA; used at boot)",
      default: false,
    },
  },
  async run({ args }) {
    await runBoothTask(async () => {
      await runCertCommand(buildBoothContext({ ip: args.ip }), {
        ifChanged: args.ifChanged,
      });
    });
  },
});

const certCopyCommand = defineCommand({
  meta: {
    name: "copy",
    description: "Print scp command to copy the mkcert root CA",
  },
  args: {
    ip: {
      type: "positional",
      description: "Optional Pi LAN IP for the scp hint",
      required: false,
    },
  },
  async run({ args }) {
    await runBoothTask(async () => {
      await runCertCopyCommand(buildBoothContext({ ip: args.ip }));
    });
  },
});

// Parent has no `run` — Citty would also invoke parent run after a subcommand.
// `default: "generate"` makes `booth cert` and `booth cert <ip>` work.
export default defineCommand({
  meta: {
    name: "cert",
    description: "TLS certificate helpers",
  },
  default: "generate",
  subCommands: {
    generate: certGenerateCommand,
    copy: certCopyCommand,
  },
});
