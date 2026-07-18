import type { FC } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import clsx from "clsx";
import { Ticket } from "lucide-react";

interface EventEmptyStateProps {
  onCreateClick: () => void;
}

export const EventEmptyState: FC<EventEmptyStateProps> = (props) => {
  const { onCreateClick } = props;

  return (
    <div className={clsx("flex min-h-[60vh] items-center justify-center px-4")}>
      <Card className={clsx("w-full max-w-lg")}>
        <CardHeader>
          <div className={clsx("mb-2 flex size-10 items-center justify-center")}>
            <Ticket className={clsx("size-6")} />
          </div>
          <CardTitle>No event yet</CardTitle>
          <CardDescription>
            Create the booth event to configure its lottery and lots. Only one
            event can be active at a time. Appearance settings (logo, shaders,
            template) will live here later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onCreateClick}>Create event</Button>
        </CardContent>
      </Card>
    </div>
  );
};
