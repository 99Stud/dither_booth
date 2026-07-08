import type { CommandContext } from "#internal/context";

import { SERVICE_USER } from "#internal/config";
import { capture, detectLanIp, run } from "#internal/system";
import { command, fail, heading, info, ok, plain, step } from "#internal/ui";

export async function certCommand(context: CommandContext): Promise<void> {
  const { repoRoot } = context;

  heading("Generate TLS certificate");

  const ip = context.ip ?? (await detectLanIp());

  if (!ip) {
    fail(
      "Could not determine LAN IP. Pass it explicitly: `booth cert <LAN_IP>`.",
    );
    throw new Error("cert-missing-ip");
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
export async function certCopyCommand(context: CommandContext): Promise<void> {
  heading("Copy root CA to your machine");

  const caroot = await capture(["mkcert", "-CAROOT"], { allowFailure: true });

  if (caroot.exitCode !== 0) {
    fail("mkcert is not available. Install it, then re-run `booth cert:copy`.");
    throw new Error("cert-copy-no-mkcert");
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
