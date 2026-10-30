import { useCallback, useEffect, useRef, useState } from "react";

import { hub } from "./hub";

export type Live<T> = {
  data: T | undefined;
  error: unknown;
  /** Reads again; resolves once the new data (or error) is in. */
  reload: () => Promise<void>;
};

/**
 * Data that stays current: read once, read again whenever one of `tables`
 * changes (Realtime, which only tells staff about their own orgs), when the
 * app comes back to the foreground (iOS pauses it), and every minute as a
 * floor.
 */
export function useLive<T>(
  name: string,
  read: () => Promise<T>,
  tables: string[],
): Live<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>(null);
  const readRef = useRef(read);
  readRef.current = read;

  const reload = useCallback(() => {
    return readRef.current().then(
      (next) => {
        setData(next);
        setError(null);
      },
      (next: unknown) => setError(next),
    );
  }, []);

  useEffect(() => {
    reload();
    const channel = hub.channel(`studio-${name}`);
    for (const table of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        reload,
      );
    }
    channel.subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(reload, 60_000);
    return () => {
      void hub.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
    // The tables are fixed per screen.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [name, reload]);

  return { data, error, reload };
}
