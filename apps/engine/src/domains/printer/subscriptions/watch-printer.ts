import { opsProcedure } from "#internal/trpc";

/**
 * The printer's status for admin: the current one first, then every change,
 * until the page closes the stream.
 */
export const watchPrinter = opsProcedure.subscription(async function* ({
  ctx,
  signal,
}) {
  yield* ctx.printer.watch(signal);
});
