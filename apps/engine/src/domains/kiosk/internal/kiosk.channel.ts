import type { KioskCommand, KioskPage } from "@dither-booth/shared/kiosk";

import { EventEmitter, on } from "node:events";

export type KioskPageConnection = KioskPage & { connectedAt: Date };

/**
 * In-memory push channel from the engine to the kiosk pages. Each page holds
 * one subscription; a command reaches the pages connected when it is sent and
 * is never replayed, so a page that reconnects later can't reload in a loop.
 */
export type KioskChannel = {
  /**
   * Registers the page straight away and streams the commands broadcast from
   * then on, until `signal` aborts or the caller stops iterating.
   */
  subscribe: (
    page: KioskPage,
    signal?: AbortSignal,
  ) => AsyncGenerator<KioskCommand, void, undefined>;
  /** Sends a command to every connected page and returns how many got it. */
  broadcast: (command: KioskCommand) => number;
  listPages: () => KioskPageConnection[];
};

const COMMAND_EVENT = "command";

export function createKioskChannel(): KioskChannel {
  const emitter = new EventEmitter();
  // One listener per connected page; there is no fixed upper bound.
  emitter.setMaxListeners(0);
  const pages = new Map<symbol, KioskPageConnection>();

  async function* streamCommands(
    connection: symbol,
    commands: AsyncIterableIterator<unknown[]>,
    signal: AbortSignal | undefined,
  ): AsyncGenerator<KioskCommand, void, undefined> {
    try {
      for await (const [command] of commands) {
        yield command as KioskCommand;
      }
    } catch (error) {
      if (!signal?.aborted) throw error;
    } finally {
      pages.delete(connection);
    }
  }

  // A page that disconnected before subscribing gets an empty stream: `on()`
  // throws for a signal that is already aborted.
  async function* noCommands(): AsyncGenerator<KioskCommand, void, undefined> {}

  return {
    subscribe(page, signal) {
      if (signal?.aborted) return noCommands();

      const connection = Symbol(page.pageId);
      // Listening starts here, before the page is listed, so a broadcast that
      // counts the page always reaches it. A generator body would only start
      // on the first `next()`.
      const commands = on(emitter, COMMAND_EVENT, signal ? { signal } : {});
      pages.set(connection, { ...page, connectedAt: new Date() });
      signal?.addEventListener("abort", () => pages.delete(connection), {
        once: true,
      });

      return streamCommands(connection, commands, signal);
    },
    broadcast(command) {
      const reached = pages.size;
      emitter.emit(COMMAND_EVENT, command);
      return reached;
    },
    listPages() {
      return [...pages.values()];
    },
  };
}
