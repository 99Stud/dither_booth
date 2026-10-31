import { logKioskEvent } from "@dither-booth/logging";
import { darkroomPinSchema } from "@dither-booth/shared/darkroom";

import { db, sqlite } from "#db/index";

import { createDarkroomAccess } from "./internal/darkroom.access";
import { DARKROOM_LOG_SOURCE } from "./internal/darkroom.constants";

/*
 * `booth pin`'s engine side: sets the staff PIN from stdin, never argv
 * (which `ps` shows). Runs as the service user, so the database's files
 * stay its own. The running engine keeps its sessions until it restarts.
 */
const runSetPinCli = async () => {
  try {
    const parsed = darkroomPinSchema.safeParse((await Bun.stdin.text()).trim());

    if (!parsed.success) {
      process.stderr.write("The staff PIN is 4 to 8 digits.\n");
      process.exitCode = 1;
      return;
    }

    await createDarkroomAccess({ db }).setPin(parsed.data);
    logKioskEvent("info", DARKROOM_LOG_SOURCE, "darkroom-pin-changed", {
      details: { by: "cli" },
    });
  } finally {
    sqlite.close();
  }
};

if (import.meta.main) {
  await runSetPinCli();
}
