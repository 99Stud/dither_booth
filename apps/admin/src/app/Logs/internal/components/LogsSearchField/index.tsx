import type { FC, Ref } from "react";

import { Input } from "@dither-booth/ui/components/ui/input";
import clsx from "clsx";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { LOGS_SEARCH_DEBOUNCE_MS } from "../../Logs.constants";

interface LogsSearchFieldProps {
  ref?: Ref<HTMLInputElement>;
  /** The search in the URL. */
  value?: string;
  /** Called once typing pauses, and at once on clear. */
  onChange: (value: string | undefined) => void;
  className?: string;
}

/**
 * Search in the lines and their errors. Typing waits a moment before the
 * view follows; `/` focuses it from anywhere on the page.
 */
export const LogsSearchField: FC<LogsSearchFieldProps> = ({
  ref,
  value,
  onChange,
  className,
}) => {
  const [draft, setDraft] = useState(value ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // The URL changed elsewhere (Clear filters, back): show it.
  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const commit = (next: string, delay: number) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(
      () => onChangeRef.current(next.trim() || undefined),
      delay,
    );
  };

  return (
    <div className={clsx("relative min-w-0", className)}>
      <Search
        aria-hidden
        className={clsx(
          "pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground",
        )}
      />
      <Input
        ref={ref}
        type="search"
        aria-label="Search logs"
        placeholder="Search"
        enterKeyHint="search"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          commit(event.target.value, LOGS_SEARCH_DEBOUNCE_MS);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(draft, 0);
          if (event.key === "Escape") {
            setDraft("");
            commit("", 0);
            event.currentTarget.blur();
          }
        }}
        className={clsx("pr-14 pl-8 [&::-webkit-search-cancel-button]:hidden")}
      />
      {draft ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setDraft("");
            commit("", 0);
          }}
          className={clsx(
            "absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md",
            "text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring/50",
          )}
        >
          <X className={clsx("size-3.5")} />
        </button>
      ) : (
        <kbd
          aria-hidden
          className={clsx(
            "pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border px-1.5 font-mono text-[0.6875rem] text-muted-foreground md:block",
          )}
        >
          /
        </kbd>
      )}
    </div>
  );
};
