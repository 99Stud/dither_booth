import {
  RELEASE_VERSION_PATTERN,
  boothRollbackModeSchema,
  boothRollbackTargetSchema,
  boothUpdateJobSchema,
} from "@dither-booth/shared/booth-update";
import z from "zod";

/*
 * What `/admin/update` takes and answers, shared by the admin server and
 * the System page.
 */

export const latestReleaseSchema = z.object({
  version: z.string(),
  /** GitHub's release notes, as markdown. */
  notes: z.string(),
  url: z.string(),
  publishedAt: z.string().nullable(),
});

export type LatestRelease = z.infer<typeof latestReleaseSchema>;

export const releaseCheckSchema = z.object({
  /** `unreachable`: no internet, or GitHub didn't answer. Not an error. */
  state: z.enum(["never", "ok", "unreachable"]),
  checkedAt: z.string().nullable(),
  message: z.string().nullable(),
});

export type ReleaseCheck = z.infer<typeof releaseCheckSchema>;

export const updateSnapshotSchema = z.object({
  /** What the booth runs: a version, or `git describe` on a checkout. */
  release: z.string(),
  /** False on a git checkout from before releases: no rollback yet. */
  isRelease: z.boolean(),
  latest: latestReleaseSchema.nullable(),
  /** True when `latest` is newer than `release`. */
  updateAvailable: z.boolean(),
  check: releaseCheckSchema,
  /** The job running now, or the last one. */
  job: boothUpdateJobSchema.nullable(),
  /**
   * The job runs, and its process still does. A `running` job a crash
   * left behind is not running: the booth ends it at its next start.
   */
  jobRunning: z.boolean(),
  /** The job's last lines from the journal (`booth`), oldest first. */
  log: z.array(z.string()),
  /** Where `booth rollback` would go now, as the CLI wrote it. */
  previous: boothRollbackTargetSchema,
  /** What an update needs, as the admin server sees it now. */
  preflight: z.object({
    /** Free bytes next to the releases; null off the booth. */
    freeBytes: z.number().nullable(),
    neededBytes: z.number(),
  }),
});

export type UpdateSnapshot = z.infer<typeof updateSnapshotSchema>;

export const updateRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("check") }),
  z.object({
    action: z.literal("install"),
    version: z.string().regex(RELEASE_VERSION_PATTERN),
  }),
  z.object({ action: z.literal("rollback"), mode: boothRollbackModeSchema }),
]);

export type UpdateRequest = z.infer<typeof updateRequestSchema>;

export const updateActionResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), snapshot: updateSnapshotSchema }),
  z.object({
    ok: z.literal(false),
    code: z.enum(["not-permitted", "busy", "failed"]),
    message: z.string(),
  }),
]);

export type UpdateActionResult = z.infer<typeof updateActionResultSchema>;
