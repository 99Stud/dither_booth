import { defineCommand } from "citty";

import { requireRoot } from "#internal/args";
import { SilentExit } from "#internal/system";
import {
  command,
  confirm,
  fail,
  heading,
  info,
  ok,
  plain,
  runBoothTask,
  warn,
} from "#internal/ui";
import { UpdateRefused } from "#internal/update/update";
import {
  type EventRows,
  countEventRows,
  findBackup,
  listBackups,
  runRestore,
} from "#internal/update/update.backup";
import { boothUpdateLayout } from "#internal/update/update.command";
import { hostUpdateHost } from "#internal/update/update.host";

/** Listed per folder without `--all`. */
const LISTED = 12;

const formatTime = (date: Date | null) =>
  date
    ? date.toLocaleString("en-GB", {
        dateStyle: "short",
        timeStyle: "medium",
      })
    : "?";

const describeRows = (rows: EventRows | null) =>
  rows
    ? `${rows.events} events, ${rows.visits} visits, ${rows.draws} draws`
    : "unreadable";

async function printBackups(all: boolean) {
  const backups = await listBackups(boothUpdateLayout());

  if (backups.length === 0) {
    info("No backups on this booth yet.");
    return;
  }

  const folders = Map.groupBy(backups, (backup) => backup.folder);

  for (const [folder, inFolder] of folders) {
    heading(`${folder.title}, newest first: ${folder.dir}`);

    for (const backup of all ? inFolder : inFolder.slice(0, LISTED)) {
      plain(
        `  ${formatTime(backup.takenAt).padEnd(20)} ${describeRows(countEventRows(backup.path)).padEnd(40)} ${backup.name}`,
      );
    }

    if (!all && inFolder.length > LISTED) {
      plain(
        `  … ${inFolder.length - LISTED} older: ${command("booth restore --all")}`,
      );
    }
  }

  plain();
  info(
    `Times are the booth's clock. Put one back: ${command("sudo booth restore <name>")}`,
  );
}

export default defineCommand({
  meta: {
    name: "restore",
    description:
      "List the database backups, or put one back (the current database is copied first)",
  },
  args: {
    backup: {
      type: "positional",
      required: false,
      description: "A backup's name from the list, or a path to a copy",
    },
    all: {
      type: "boolean",
      description: "List every backup, not only the newest",
    },
  },
  async run({ args }) {
    await runBoothTask(async () => {
      if (!args.backup) {
        await printBackups(Boolean(args.all));
        return;
      }

      requireRoot("restore");
      const layout = boothUpdateLayout();

      try {
        const backup = await findBackup(layout, args.backup);
        heading("Restore the database");
        info(`${backup} holds ${describeRows(countEventRows(backup))}.`);

        const proceed = await confirm(
          "Restart the booth on this backup? What happened since it was taken is set aside.",
        );
        if (!proceed) {
          fail("Nothing changed.");
          throw new SilentExit(1);
        }

        const { replaced, verdict } = await runRestore({
          layout,
          host: hostUpdateHost,
          backup,
        });

        if (replaced) {
          info(`The database it replaced is kept as ${replaced}.`);
        }
        if (!verdict.ok) {
          warn(`The booth didn't come up again: ${verdict.reason}.`);
          throw new SilentExit(1);
        }
        ok("Restored. The booth runs on the backup.");
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
