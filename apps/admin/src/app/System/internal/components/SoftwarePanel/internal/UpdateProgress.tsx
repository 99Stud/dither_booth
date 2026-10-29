import type { BoothUpdateJob } from "@dither-booth/shared/booth-update";
import type { FC } from "react";

import {
  type ChartConfig,
  ChartContainer,
} from "@dither-booth/ui/components/ui/chart";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";
import { Check, Circle, PlugZap } from "lucide-react";
import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";

import {
  UPDATE_STEP_LABELS,
  getJobProgress,
  getJobSteps,
  isRestartStep,
} from "#lib/update/update.utils";

import { useTweenedNumber } from "../../../hooks/useTweenedNumber";
import { useStepAdvance } from "../../../hooks/useUpdateMotion";
import {
  UPDATE_STEP_ATTRIBUTE,
  UPDATE_STEP_ICON_ATTRIBUTE,
} from "../../../System.motion";

const gaugeConfig = {
  progress: { label: "Progress", color: "var(--chart-1)" },
} satisfies ChartConfig;

/**
 * A running job: how far it is on a gauge, as the Temperature panel
 * draws its own, and its steps beside it. The share moves to each new
 * step instead of jumping; the step that ended pops its check.
 */
export const UpdateProgress: FC<{
  /** Null while the request waits for its job to appear. */
  job: BoothUpdateJob | null;
  /** The admin server isn't answering: it restarts under the page. */
  isUnreachable: boolean;
}> = ({ job, isUnreachable }) => {
  const steps = getJobSteps(job);
  const current = job?.step ?? "preflight";
  const currentIndex = steps.indexOf(current);
  const progress = useTweenedNumber(getJobProgress(job)) ?? 0;
  const listRef = useStepAdvance<HTMLOListElement>(currentIndex);
  const restarting = isUnreachable || isRestartStep(job?.step);
  const title = job
    ? `${job.kind === "update" ? "Updating" : "Going back"} to ${job.to}`
    : "Starting";

  return (
    <div
      className={clsx(
        "grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center",
      )}
    >
      <div className={clsx("relative mx-auto size-40")}>
        <ChartContainer
          aria-hidden
          config={gaugeConfig}
          className={clsx("absolute inset-0 aspect-auto h-full w-full")}
        >
          <RadialBarChart
            data={[{ name: "progress", value: progress }]}
            startAngle={90}
            endAngle={-270}
            innerRadius="82%"
            outerRadius="100%"
            barSize={12}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <RadialBar
              dataKey="value"
              background
              cornerRadius={6}
              fill="var(--color-progress)"
              isAnimationActive={false}
            />
          </RadialBarChart>
        </ChartContainer>
        <div
          className={clsx(
            "absolute inset-0 flex flex-col items-center justify-center text-center",
          )}
        >
          <span className={clsx("text-3xl font-semibold tabular-nums")}>
            {Math.round(progress)}%
          </span>
          <span className={clsx("mt-1 max-w-28 text-xs text-muted-foreground")}>
            {title}
          </span>
        </div>
      </div>

      <div className={clsx("flex flex-col gap-3")}>
        <ol
          ref={listRef}
          aria-label="Update steps"
          className={clsx("grid gap-1.5 text-sm sm:grid-cols-2")}
        >
          {steps.map((step, index) => (
            <li
              key={step}
              {...{ [UPDATE_STEP_ATTRIBUTE]: "" }}
              aria-current={index === currentIndex ? "step" : undefined}
              className={clsx(
                "flex items-center gap-2",
                index > currentIndex && "text-muted-foreground",
                index === currentIndex && "font-medium",
              )}
            >
              <span
                {...{ [UPDATE_STEP_ICON_ATTRIBUTE]: "" }}
                className={clsx("inline-flex")}
              >
                {index < currentIndex ? (
                  <Check aria-hidden className={clsx("size-4 text-success")} />
                ) : index === currentIndex ? (
                  <Spinner aria-hidden className={clsx("size-4")} />
                ) : (
                  <Circle aria-hidden className={clsx("size-4")} />
                )}
              </span>
              {UPDATE_STEP_LABELS[step]}
            </li>
          ))}
        </ol>
        <p
          role="status"
          className={clsx(
            "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
            restarting && "border-warning/50",
          )}
        >
          {restarting && (
            <PlugZap
              aria-hidden
              className={clsx("mt-0.5 size-4 shrink-0 text-warning")}
            />
          )}
          {restarting
            ? "The booth is restarting. This page reconnects on its own."
            : "The booth keeps working while this runs. It restarts briefly at the end."}
        </p>
      </div>
    </div>
  );
};
