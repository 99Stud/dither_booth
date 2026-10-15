import type { FC, ReactNode } from "react";

import { Link, useLocation } from "@tanstack/react-router";
import clsx from "clsx";
import { SlidersHorizontal } from "lucide-react";

import { APP_SIDEBAR_MENU_LINKS } from "#components/Layout/AppSidebar/internal/AppSidebar.constants";
import { useDarkroomHref } from "#lib/darkroom/useDarkroomHref";

const TAB_CLASS_NAME = clsx(
  "flex h-14 flex-col items-center justify-center gap-0.5 rounded-full",
  "text-[0.625rem] font-semibold text-foreground/80",
  "transition-[background-color,color,scale] duration-200",
  "active:scale-95 aria-disabled:opacity-40 [&_svg]:size-6",
  // The selected tab sits in a lens of its own, tinted with the accent.
  "aria-[current=page]:bg-foreground/[0.07] aria-[current=page]:text-primary",
  "dark:aria-[current=page]:bg-white/10",
);

const TabLabel: FC<{ icon: ReactNode; label: string }> = ({ icon, label }) => (
  <>
    {icon}
    <span>{label}</span>
  </>
);

/**
 * The phone's navigation, as an iOS 26 tab bar: a Liquid Glass capsule
 * floating above the home indicator, at the thumb's reach, with content
 * scrolling beneath it and fading out at the edge. Tablets and desktops
 * keep the sidebar.
 */
export const AppTabBar: FC = () => {
  const pathname = useLocation({ select: (location) => location.pathname });
  const darkroomHref = useDarkroomHref();

  return (
    <nav
      aria-label="Sections"
      className={clsx(
        "pointer-events-none fixed inset-x-0 bottom-0 z-30 md:hidden",
        "px-4 pt-10 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        // The scroll edge effect: content fades out under the bar.
        "bg-linear-to-t from-background from-30% to-transparent",
      )}
    >
      <ul
        className={clsx(
          "pointer-events-auto mx-auto grid max-w-sm grid-cols-3 glass",
          "rounded-full p-1",
        )}
      >
        {APP_SIDEBAR_MENU_LINKS.map((link) => (
          <li key={link.path}>
            <Link
              to={link.path}
              aria-current={pathname === link.path ? "page" : undefined}
              className={TAB_CLASS_NAME}
            >
              <TabLabel icon={link.icon} label={link.shortLabel} />
            </Link>
          </li>
        ))}
        <li>
          <a
            href={darkroomHref}
            aria-disabled={!darkroomHref}
            rel="noreferrer"
            target="_blank"
            className={TAB_CLASS_NAME}
          >
            <TabLabel icon={<SlidersHorizontal />} label="Darkroom" />
          </a>
        </li>
      </ul>
    </nav>
  );
};
