import type { SystemSnapshot } from "./system.protocol";

/*
 * For render tests: the admin server as the page sees it, and an OS that
 * asks for reduced motion so every tween lands at once and the assertions
 * read the real numbers.
 */

export function installReducedMotion() {
  const original = window.matchMedia;

  window.matchMedia = ((query: string) =>
    query.includes("prefers-reduced-motion")
      ? ({
          matches: true,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
        } as unknown as MediaQueryList)
      : original.call(window, query)) as typeof window.matchMedia;

  return () => {
    window.matchMedia = original;
  };
}

/** Answers `/admin/system` with `snapshot`, or fails when it is undefined. */
export function installFakeSystemFetch(snapshot: SystemSnapshot | undefined) {
  const original = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));

    if (!snapshot) {
      throw new TypeError("Failed to fetch");
    }

    return new Response(JSON.stringify(snapshot), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
