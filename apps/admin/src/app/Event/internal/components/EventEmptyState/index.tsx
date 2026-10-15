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
import { Plus, Ticket } from "lucide-react";

interface EventEmptyStateProps {
  onCreateClick: () => void;
}

export const EventEmptyState: FC<EventEmptyStateProps> = (props) => {
  const { onCreateClick } = props;

  return (
    <Empty className={clsx("min-h-[60vh] border border-dashed")}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Ticket />
        </EmptyMedia>
        <EmptyTitle>No event yet</EmptyTitle>
        <EmptyDescription>
          Create the booth event to pick its ticket kit and set up its lottery
          and prizes. One event is active at a time.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onCreateClick}>
          <Plus data-icon="inline-start" />
          Create event
        </Button>
      </EmptyContent>
    </Empty>
  );
};
