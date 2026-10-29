import type { LatestRelease } from "@dither-booth/shared/booth-update";
import type { FC } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dither-booth/ui/components/ui/collapsible";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";

import { ReleaseNotesBody } from "#lib/update/update.markdown";

/** What's new in the release, folded until asked for. */
export const ReleaseNotes: FC<{ release: LatestRelease }> = ({ release }) =>
  release.notes ? (
    <Collapsible>
      <CollapsibleTrigger
        render={
          <Button size="sm" variant="ghost" className={clsx("group -ml-2")} />
        }
      >
        What's new
        <ChevronDown
          aria-hidden
          className={clsx(
            "transition-transform group-data-[panel-open]:rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          className={clsx(
            "mt-2 max-h-72 overflow-auto rounded-md bg-muted/60 p-3",
          )}
        >
          <ReleaseNotesBody markdown={release.notes} />
        </div>
        {release.url && (
          <a
            href={release.url}
            target="_blank"
            rel="noreferrer"
            className={clsx(
              "mt-2 inline-block text-sm underline underline-offset-4",
            )}
          >
            The release on GitHub
          </a>
        )}
      </CollapsibleContent>
    </Collapsible>
  ) : null;
