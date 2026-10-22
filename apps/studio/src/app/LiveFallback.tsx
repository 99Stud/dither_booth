import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import clsx from "clsx";

/** What a screen shows before its first read: a spinner, or why it failed. */
export const LiveFallback = ({
  error,
  what,
}: {
  error: unknown;
  what: string;
}) =>
  error ? (
    <p className={clsx("text-sm text-destructive")}>
      Couldn't load the {what}. Check the connection.
    </p>
  ) : (
    <Spinner className="mx-auto size-5" />
  );
