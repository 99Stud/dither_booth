import * as p from "@clack/prompts";
import { darkroomPinSchema } from "@dither-booth/shared/darkroom";
import { isReleaseBundle } from "@dither-booth/shared/server/booth-update";
import { defineCommand } from "citty";

import type { BoothContext } from "#internal/context";

import { requireRoot } from "#internal/args";
import { printCommandBanner } from "#internal/banner";
import { ENGINE_DB_RELATIVE, SERVICE_NAME } from "#internal/config";
import { buildBoothContext } from "#internal/context";
import { readStaffPinSet } from "#internal/staff-pin";
import { capture, run, serviceBun, SilentExit } from "#internal/system";
import { fail, heading, ok, runBoothTask, step, warn } from "#internal/ui";

/*
 * The staff PIN opens admin and the Darkroom. Admin can't be opened without
 * it, so the first one is set here, on the booth; this also resets a
 * forgotten one.
 */

const askPin = async (message: string): Promise<string> => {
  const pin = await p.password({
    message,
    mask: "•",
    validate: (value) =>
      darkroomPinSchema.safeParse(value ?? "").success
        ? undefined
        : "Use 4 to 8 digits.",
  });

  if (p.isCancel(pin)) {
    p.cancel("No PIN set.");
    throw new SilentExit(1);
  }

  return pin;
};

/** Asks twice on a terminal; reads one line from stdin otherwise. */
const readNewPin = async (): Promise<string> => {
  if (!process.stdin.isTTY) {
    return (await Bun.stdin.text()).trim();
  }

  for (;;) {
    const pin = await askPin("New staff PIN (4 to 8 digits)");
    if ((await askPin("Type it again")) === pin) return pin;
    warn("The two PINs differ. Try again.");
  }
};

/**
 * The bun arguments that set the PIN, run from the repo root. A release
 * ships the engine's `dist/`, not its `src/`: there the build's copy runs.
 */
export function setStaffPinArgs(options: { release: boolean }): string[] {
  return options.release
    ? ["apps/engine/dist/set-staff-pin.js"]
    : ["apps/engine/src/domains/darkroom/darkroom.set-pin.ts"];
}

/** Stores the PIN as the service user, through the engine's own code. */
async function setStaffPin(context: BoothContext, pin: string): Promise<void> {
  const { repoRoot } = context;
  const result = await capture(
    serviceBun(setStaffPinArgs({ release: isReleaseBundle(repoRoot) })),
    { allowFailure: true, cwd: repoRoot, input: `${pin}\n` },
  );

  if (result.exitCode !== 0) {
    fail(result.stderr.trim() || "Couldn't save the staff PIN.");
    throw new SilentExit(1);
  }
}

export async function runPinCommand(
  context: BoothContext,
  { restart }: { restart: boolean },
): Promise<void> {
  heading("Set the staff PIN");

  await setStaffPin(context, await readNewPin());
  ok("Staff PIN saved. It opens admin and the Darkroom.");

  if (restart) {
    // Sessions live in the engine's memory: a restart signs everyone out.
    step("Restarting the booth so every open session signs out");
    await run(["systemctl", "try-restart", SERVICE_NAME], {
      allowFailure: true,
    });
  }
}

/** `booth install`: asks for a PIN on a terminal when there's none yet. */
export async function ensureStaffPin(context: BoothContext): Promise<void> {
  const check = readStaffPinSet(`${context.repoRoot}/${ENGINE_DB_RELATIVE}`);

  if ("set" in check && check.set) {
    ok("Staff PIN already set");
    return;
  }

  if (!process.stdin.isTTY) {
    warn("No staff PIN yet: admin stays locked. Run `sudo booth pin`.");
    return;
  }

  await runPinCommand(context, { restart: false });
}

export default defineCommand({
  meta: {
    name: "pin",
    description: "Set or reset the staff PIN (opens admin and the Darkroom)",
  },
  async setup() {
    requireRoot("pin");
    printCommandBanner("pin");
  },
  async run() {
    await runBoothTask(async () => {
      await runPinCommand(buildBoothContext(), { restart: true });
    });
  },
});
