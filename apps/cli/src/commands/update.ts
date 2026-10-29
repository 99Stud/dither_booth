import { defineCommand } from "citty";

import { requireRoot } from "#internal/args";
import { heading, info, runBoothTask } from "#internal/ui";
import { runRecover, runUpdate } from "#internal/update/update";
import { boothUpdateLayout, runGuarded } from "#internal/update/update.command";
import { hostUpdateHost } from "#internal/update/update.host";

export default defineCommand({
  meta: {
    name: "update",
    description:
      "Install a release side by side, switch to it, roll back if it doesn't start",
  },
  args: {
    version: {
      type: "positional",
      required: false,
      description: "Release to install, e.g. 0.8.0 (default: the latest)",
    },
    resume: {
      type: "string",
      description: "Internal: carry on a job the previous CLI started",
    },
    recover: {
      type: "boolean",
      description:
        "End an update whose process is gone: back to the release before if it had switched",
    },
    restart: {
      type: "boolean",
      default: true,
      description:
        "With --recover: restart the booth (--no-restart inside the booth's own start)",
    },
  },
  async setup() {
    requireRoot("update");
  },
  async run({ args }) {
    await runBoothTask(async () => {
      if (args.recover) {
        const job = await runRecover({
          layout: boothUpdateLayout(),
          host: hostUpdateHost,
          restart: args.restart,
        });
        if (!job) info("No interrupted update.");
        return;
      }

      heading("Update the booth");
      await runGuarded(() =>
        runUpdate({
          layout: boothUpdateLayout(),
          host: hostUpdateHost,
          version: args.version?.replace(/^v/u, "") || undefined,
          resumeJobId: args.resume || undefined,
        }),
      );
    });
  },
});
