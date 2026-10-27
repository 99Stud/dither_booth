import type { FC } from "react";

import clsx from "clsx";

import { splitOnMatches } from "../../Logs.utils";

/** `text` with each match of the search marked. */
export const LogsHighlight: FC<{ text: string; search?: string }> = ({
  text,
  search,
}) => (
  <>
    {splitOnMatches(text, search).map((part, index) =>
      part.isMatch ? (
        <mark
          key={index}
          className={clsx(
            "rounded-sm bg-warning/30 text-foreground dark:bg-warning/40",
          )}
        >
          {part.text}
        </mark>
      ) : (
        part.text
      ),
    )}
  </>
);
