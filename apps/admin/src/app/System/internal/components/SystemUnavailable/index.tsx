import type { FC } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@dither-booth/ui/components/ui/empty";
import clsx from "clsx";
import { Cpu, RefreshCcw } from "lucide-react";

/** Nothing to show yet: the admin server doesn't answer, or hasn't read the Pi. */
export const SystemUnavailable: FC<{
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}> = ({ message, isRetrying, onRetry }) => (
  <Empty className={clsx("min-h-64 border")}>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <Cpu />
      </EmptyMedia>
      <EmptyTitle>Can't read the Pi</EmptyTitle>
      <EmptyDescription>{message}</EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button variant="outline" onClick={onRetry} disabled={isRetrying}>
        <RefreshCcw className={clsx(isRetrying && "animate-spin")} />
        Try again
      </Button>
    </EmptyContent>
  </Empty>
);
