import { defineCommand } from "citty";

import { requireRoot } from "#internal/args";
import { SilentExit } from "#internal/system";
import { fail, ok, runBoothTask } from "#internal/ui";
import { UpdateRefused } from "#internal/update/update";
import { runBackup } from "#internal/update/update.backup";
import { boothUpdateLayout } from "#internal/update/update.command";
import { hostUpdateHost } from "#internal/update/update.host";

export default defineCommand({
  meta: {
    name: "backup",
    description: "Copy the database now, with the booth running",
  },
  async setup() {
    requireRoot("backup");
  },
  async run() {
    await runBoothTask(async () => {
      try {
        const path = await runBackup({
          layout: boothUpdateLayout(),
          host: hostUpdateHost,
        });
        ok(`Database backed up to ${path}`);
      } catch (error) {
        if (error instanceof UpdateRefused) {
          fail(error.message);
          throw new SilentExit(1);
        }
        throw error;
      }
    });
  },
});
