import type { FC } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dither-booth/ui/components/ui/collapsible";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { ChevronDown, ScrollText } from "lucide-react";

import { LOGS_PAGE_PATH } from "#lib/logs/logs.search";

/** The job's last lines, and the Logs page for the rest. */
export const UpdateLog: FC<{ lines: string[] }> = ({ lines }) => (
  <Collapsible>
    <CollapsibleTrigger
      render={
        <Button size="sm" variant="ghost" className={clsx("group -ml-2")} />
      }
    >
      Details
      <ChevronDown
        aria-hidden
        className={clsx(
          "transition-transform group-data-[panel-open]:rotate-180",
        )}
      />
    </CollapsibleTrigger>
    <CollapsibleContent>
      <pre
        aria-label="Update log"
        className={clsx(
          "mt-2 max-h-56 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap",
        )}
      >
        {lines.length > 0 ? lines.join("\n") : "No lines yet."}
      </pre>
      <Link
        to={LOGS_PAGE_PATH}
        search={{ services: "system" }}
        className={clsx(
          "mt-2 inline-flex items-center gap-1.5 text-sm underline underline-offset-4",
        )}
      >
        <ScrollText aria-hidden className={clsx("size-4")} />
        All of it on the Logs page
      </Link>
    </CollapsibleContent>
  </Collapsible>
);
