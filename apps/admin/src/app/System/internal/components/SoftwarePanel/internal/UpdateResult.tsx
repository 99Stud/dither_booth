import type { BoothUpdateJob } from "@dither-booth/shared/booth-update";
import type { FC } from "react";

import clsx from "clsx";
import { formatDistanceToNowStrict } from "date-fns";

import { useDrawOnce } from "../../../hooks/useUpdateMotion";

const MARKS = {
  done: { tone: "text-success", paths: ["M8 12.5l2.7 2.7L16 9.5"] },
  "rolled-back": {
    tone: "text-warning",
    paths: ["M15.5 8.5L9 12l6.5 3.5", "M9 12h7"],
  },
  failed: { tone: "text-destructive", paths: ["M9 9l6 6", "M15 9l-6 6"] },
} as const;

/**
 * How the last job ended, while it's recent: a ring and its mark that
 * draw themselves once (a check, an arrow back, a cross), then the words.
 */
export const UpdateResult: FC<{ job: BoothUpdateJob }> = ({ job }) => {
  const state = job.state === "running" ? "failed" : job.state;
  const mark = MARKS[state];
  const ref = useDrawOnce<SVGSVGElement>(true);
  const ago = formatDistanceToNowStrict(new Date(job.updatedAt), {
    addSuffix: true,
  });
  const title =
    state === "done"
      ? `${job.kind === "update" ? "Updated" : "Went back"} to ${job.to} ${ago}.`
      : state === "rolled-back"
        ? `${job.to} didn't start. The booth went back to ${job.from}.`
        : `${job.kind === "update" ? "The update" : "The rollback"} stopped. The booth still runs ${job.from}.`;

  return (
    <div
      role={state === "done" ? "status" : "alert"}
      className={clsx(
        "flex items-start gap-3 rounded-lg border px-3 py-3 text-sm",
        state !== "done" && "border-destructive/40",
      )}
    >
      <svg
        ref={ref}
        aria-hidden
        viewBox="0 0 24 24"
        className={clsx("size-8 shrink-0", mark.tone)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9.5" />
        {mark.paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      <div className={clsx("min-w-0")}>
        <p
          className={clsx(
            "font-medium",
            state !== "done" && "text-destructive",
          )}
        >
          {title}
        </p>
        {state !== "done" && job.error && (
          <p className={clsx("text-muted-foreground")}>{job.error}</p>
        )}
      </div>
    </div>
  );
};
