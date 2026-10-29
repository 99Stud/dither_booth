import { boothRollbackModeSchema } from "@dither-booth/shared/booth-update";
import { defineCommand } from "citty";

import { requireRoot } from "#internal/args";
import { SilentExit } from "#internal/system";
import { fail, heading, runBoothTask } from "#internal/ui";
import { runRollback } from "#internal/update/update";
import { boothUpdateLayout, runGuarded } from "#internal/update/update.command";
import { hostUpdateHost } from "#internal/update/update.host";

export default defineCommand({
  meta: {
    name: "rollback",
    description: "Go back to the release that ran before the last update",
  },
  args: {
    "restore-db": {
      type: "boolean",
      description:
        "Also restore the database backup taken before the update (visits since are lost)",
    },
    mode: {
      type: "string",
      description: "Internal, for the systemd unit: keep-db or restore-db",
    },
  },
  async setup() {
    requireRoot("rollback");
  },
  async run({ args }) {
    await runBoothTask(async () => {
      heading("Roll back the booth");

      const mode = boothRollbackModeSchema.safeParse(
        args.mode ?? (args["restore-db"] ? "restore-db" : "keep-db"),
      );

      if (!mode.success) {
        fail(`Unknown rollback mode: ${args.mode}`);
        throw new SilentExit(1);
      }

      await runGuarded(() =>
        runRollback({
          layout: boothUpdateLayout(),
          host: hostUpdateHost,
          mode: mode.data,
        }),
      );
    });
  },
});
