import { defineCommand } from "citty";

import type { BoothContext } from "#internal/context";

import { SERVICE_USER } from "#internal/config";
import { buildBoothContext } from "#internal/context";
import { capture, detectLanIp, run, SilentExit } from "#internal/system";
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

export async function runCertCommand(context: BoothContext): Promise<void> {
  const { repoRoot } = context;

  heading("Generate TLS certificate");

  const ip = context.ip ?? (await detectLanIp());

  if (!ip) {
    fail(
      "Could not determine LAN IP. Pass it explicitly: `booth cert generate <LAN_IP>`.",
    );
    throw new SilentExit(1);
  }

  step(`Generating certificate for ${ip}`);
  await run(
    ["bun", "run", "--filter", "@dither-booth/api", "cert:generate", ip],
    { cwd: repoRoot },
  );

  ok(`Certificate generated for ${ip}`);
}

// Prints a ready-to-paste scp command so the operator can copy the mkcert root
// CA from this Pi to their own machine and trust it.
export async function runCertCopyCommand(context: BoothContext): Promise<void> {
  heading("Copy root CA to your machine");

  const caroot = await capture(["mkcert", "-CAROOT"], { allowFailure: true });

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
  },
  async run({ args }) {
    await runBoothTask(async () => {
      await runCertCommand(buildBoothContext({ ip: args.ip }));
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
