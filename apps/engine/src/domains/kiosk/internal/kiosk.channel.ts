import type {
  KioskCommand,
  KioskPage,
  KioskPageStatus,
} from "@dither-booth/shared/kiosk";

import { EventEmitter, on } from "node:events";

export type KioskPageConnection = KioskPage &
  KioskPageStatus & {
    connectedAt: Date;
    /** When the page last reported its status, if it has. */
    reportedAt: Date | null;
  };

/**
 * In-memory push channel from the engine to the kiosk pages. Each page holds
 * one subscription; a command reaches the pages connected when it is sent and
 * is never replayed, so a page that reconnects later can't reload in a loop.
 * State a page needs on (re)connecting, like maintenance, is passed as the
 * subscription's `initial` command instead.
 */
export type KioskChannel = {
  /**
   * Registers the page straight away and streams `initial`, if given, then
   * the commands broadcast from then on, until `signal` aborts or the caller
   * stops iterating.
   */
  subscribe: (
    page: KioskPage,
    signal?: AbortSignal,
    initial?: readonly KioskCommand[],
  ) => AsyncGenerator<KioskCommand, void, undefined>;
  /** Sends a command to every connected page and returns how many got it. */
  broadcast: (command: KioskCommand) => number;
  /**
   * Records what a connected page reports about itself. Returns false when
   * no connected page has that id (not subscribed yet, or gone).
   */
  reportStatus: (pageId: string, status: KioskPageStatus) => boolean;
  listPages: () => KioskPageConnection[];
  /** Calls `listener` with a page's id once it disconnects; returns an unsubscribe. */
  onPageLeft: (listener: (pageId: string) => void) => () => void;
  /**
   * Calls `listener` whenever `listPages()` would answer differently: a
   * page connected, reported its status or left. Returns an unsubscribe.
   */
  onPagesChanged: (listener: () => void) => () => void;
};

const COMMAND_EVENT = "command";
const PAGE_LEFT_EVENT = "page-left";
const PAGES_CHANGED_EVENT = "pages-changed";

export function createKioskChannel(): KioskChannel {
  const emitter = new EventEmitter();
  // One listener per connected page; there is no fixed upper bound.
  emitter.setMaxListeners(0);
  const pages = new Map<symbol, KioskPageConnection>();

  // Both the abort listener and the stream's `finally` end a page: whichever
  // runs first reports it, once.
  const removePage = (connection: symbol) => {
    const page = pages.get(connection);
    if (!page) return;
    pages.delete(connection);
    emitter.emit(PAGE_LEFT_EVENT, page.pageId);
    emitter.emit(PAGES_CHANGED_EVENT);
  };

  async function* streamCommands(
    connection: symbol,
    commands: AsyncIterableIterator<unknown[]>,
    signal: AbortSignal | undefined,
    initial: readonly KioskCommand[],
  ): AsyncGenerator<KioskCommand, void, undefined> {
    try {
      yield* initial;
      for await (const [command] of commands) {
        yield command as KioskCommand;
      }
    } catch (error) {
      if (!signal?.aborted) throw error;
    } finally {
      removePage(connection);
    }
  }

  // A page that disconnected before subscribing gets an empty stream: `on()`
  // throws for a signal that is already aborted.
  async function* noCommands(): AsyncGenerator<KioskCommand, void, undefined> {}

  return {
    subscribe(page, signal, initial = []) {
      if (signal?.aborted) return noCommands();

      const connection = Symbol(page.pageId);
      // Listening starts here, before the page is listed, so a broadcast that
      // counts the page always reaches it. A generator body would only start
      // on the first `next()`.
      const commands = on(emitter, COMMAND_EVENT, signal ? { signal } : {});
      pages.set(connection, {
        ...page,
        camera: null,
        maintenance: false,
        connectedAt: new Date(),
        reportedAt: null,
      });
      signal?.addEventListener("abort", () => removePage(connection), {
        once: true,
      });
      emitter.emit(PAGES_CHANGED_EVENT);

      return streamCommands(connection, commands, signal, initial);
    },
    broadcast(command) {
      const reached = pages.size;
      emitter.emit(COMMAND_EVENT, command);
      return reached;
    },
    reportStatus(pageId, status) {
      for (const [connection, page] of pages) {
        if (page.pageId !== pageId) continue;
        pages.set(connection, { ...page, ...status, reportedAt: new Date() });
        emitter.emit(PAGES_CHANGED_EVENT);
        return true;
      }
      return false;
    },
    listPages() {
      return [...pages.values()];
    },
    onPageLeft(listener) {
      emitter.on(PAGE_LEFT_EVENT, listener);
      return () => emitter.off(PAGE_LEFT_EVENT, listener);
    },
    onPagesChanged(listener) {
      emitter.on(PAGES_CHANGED_EVENT, listener);
      return () => emitter.off(PAGES_CHANGED_EVENT, listener);
    },
  };
}
