import clsx from "clsx";
import { Bell, BellOff } from "lucide-react";

import type { MemberTone } from "#lib/team";

const STATUS_STYLE: Record<
  MemberTone,
  { className: string; Icon: typeof Bell | null }
> = {
  ok: { className: "text-muted-foreground", Icon: Bell },
  // IconBubble's amber text pair: the theme's --warning is a fill, too light
  // for text on the card.
  warn: {
    className: "text-amber-700 dark:text-amber-300", // ds-allow-hardcode
    Icon: BellOff,
  },
  off: { className: "text-muted-foreground", Icon: null },
};

/** Whether someone's phone will ring, under their address in Team and On call. */
export const MemberStatusLine = ({
  status,
}: {
  status: { text: string; tone: MemberTone };
}) => {
  const { className, Icon } = STATUS_STYLE[status.tone];
  return (
    <p className={clsx("flex items-center gap-1.5 text-xs", className)}>
      {Icon ? <Icon aria-hidden className={clsx("size-3.5")} /> : null}
      {status.text}
    </p>
  );
};
