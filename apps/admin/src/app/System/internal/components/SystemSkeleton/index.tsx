import type { FC } from "react";

import {
  Card,
  CardContent,
  CardHeader,
} from "@dither-booth/ui/components/ui/card";
import { Skeleton } from "@dither-booth/ui/components/ui/skeleton";
import clsx from "clsx";

const PanelSkeleton: FC<{ className?: string; bodyClassName: string }> = ({
  className,
  bodyClassName,
}) => (
  <Card aria-hidden className={clsx("h-full", className)}>
    <CardHeader>
      <div className={clsx("flex items-center gap-2.5")}>
        <Skeleton className={clsx("size-7 rounded-lg")} />
        <Skeleton className={clsx("h-5 w-28")} />
      </div>
    </CardHeader>
    <CardContent>
      <Skeleton className={clsx("w-full", bodyClassName)} />
    </CardContent>
  </Card>
);

/** The page's shape while the first reading loads, so nothing moves. */
export const SystemSkeleton: FC = () => (
  <div className={clsx("grid gap-4 lg:grid-cols-12")}>
    <PanelSkeleton className={clsx("lg:col-span-8")} bodyClassName="h-48" />
    <PanelSkeleton className={clsx("lg:col-span-4")} bodyClassName="h-48" />
    <PanelSkeleton className={clsx("lg:col-span-12")} bodyClassName="h-32" />
    <PanelSkeleton className={clsx("lg:col-span-6")} bodyClassName="h-40" />
    <PanelSkeleton className={clsx("lg:col-span-6")} bodyClassName="h-40" />
  </div>
);
