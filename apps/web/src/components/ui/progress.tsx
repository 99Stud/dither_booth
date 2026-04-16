import { cn } from "#lib/utils.ts";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { type ComponentPropsWithoutRef, type FC } from "react";

export const Progress: FC<
  ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    indeterminate?: boolean;
  }
> = (props) => {
  const { className, value, max = 100, indeterminate, ...rest } = props;

  if (indeterminate) {
    return (
      <div
        className={cn(
          "relative h-1 w-full overflow-hidden rounded-none bg-muted",
          className,
        )}
        role="progressbar"
        aria-busy="true"
        aria-valuetext="Loading"
      >
        <div className="progress-indeterminate-bar absolute inset-y-0 left-0 w-1/3 bg-primary" />
      </div>
    );
  }

  const pct =
    value != null && max > 0
      ? Math.min(100, Math.max(0, (value / max) * 100))
      : 0;

  return (
    <ProgressPrimitive.Root
      className={cn(
        "relative h-1 w-full overflow-hidden rounded-none bg-muted",
        className,
      )}
      value={value}
      max={max}
      {...rest}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full bg-primary transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${100 - pct}%)` }}
      />
    </ProgressPrimitive.Root>
  );
};
