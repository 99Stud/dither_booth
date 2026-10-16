import type { FC, PropsWithChildren, ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@dither-booth/ui/components/ui/breadcrumb";
import { Separator } from "@dither-booth/ui/components/ui/separator";
import {
  SidebarTrigger,
  useSidebar,
} from "@dither-booth/ui/components/ui/sidebar";
import { TabsList, TabsTrigger } from "@dither-booth/ui/components/ui/tabs";
import clsx from "clsx";
import { useEffect, useState } from "react";

/** Marks the page's large title, which the phone's top bar watches. */
const PAGE_TITLE_ATTRIBUTE = "data-page-title";

/**
 * Whether the page's large title has scrolled under the top bar, as on
 * iOS: the bar then shows the title small, centred, over a hairline.
 */
const useLargeTitleScrolledAway = () => {
  const [isScrolledAway, setIsScrolledAway] = useState(false);

  useEffect(() => {
    const title = document.querySelector(`[${PAGE_TITLE_ATTRIBUTE}]`);
    if (!title) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsScrolledAway(!entry?.isIntersecting),
      // The top bar is 52 px: the title counts as gone once under it.
      { rootMargin: "-52px 0px 0px 0px" },
    );
    observer.observe(title);
    return () => observer.disconnect();
  }, []);

  return isScrolledAway;
};

interface AppSidebarPageHeaderProps {
  /** The current page, last in the breadcrumb. */
  title: string;
  /** The page's section, before it in the breadcrumb (e.g. "Booth"). */
  section?: string;
}

/**
 * The slim top bar of every page. On tablets and desktops, as on Vercel's
 * and Linear's dashboards: sidebar toggle and a breadcrumb. On phones, an
 * iOS navigation bar that takes no room: it floats over the page and only
 * shows the title, small and centred, once the large title scrolls away.
 */
export const AppSidebarPageHeader: FC<AppSidebarPageHeaderProps> = ({
  title,
  section = "Booth",
}) => {
  const isTitleScrolledAway = useLargeTitleScrolledAway();

  return (
    <header
      data-scrolled={isTitleScrolledAway}
      className={clsx(
        "top-0 z-20 md:sticky",
        "flex h-[3.25rem] shrink-0 items-center gap-2 px-4 md:h-12",
        "max-md:pointer-events-none max-md:fixed max-md:inset-x-0",
        "max-md:h-[calc(3.25rem+env(safe-area-inset-top))]",
        "md:border-b md:bg-background/85 md:backdrop-blur-xl md:backdrop-saturate-150",
        "pt-[env(safe-area-inset-top)] md:rounded-t-xl md:pt-0",
        // Phones: no bar, only a scroll edge that fades the content out
        // under the title once the large title has scrolled away.
        "max-md:before:pointer-events-none max-md:before:absolute max-md:before:inset-x-0",
        "max-md:before:top-0 max-md:before:-bottom-6 max-md:before:-z-10",
        "max-md:before:bg-linear-to-b max-md:before:from-background max-md:before:from-55%",
        "max-md:before:to-transparent max-md:before:opacity-0 max-md:before:transition-opacity",
        "max-md:data-[scrolled=true]:before:opacity-100",
      )}
    >
      <span
        aria-hidden={!isTitleScrolledAway}
        className={clsx(
          "w-full truncate px-8 text-center text-[1.0625rem] font-semibold md:hidden",
          "transition-opacity",
          isTitleScrolledAway ? "opacity-100" : "opacity-0",
        )}
      >
        {title}
      </span>
      <SidebarTrigger className="-ml-1 max-md:hidden" />
      <Separator
        orientation="vertical"
        className="mr-1 max-md:hidden data-vertical:h-4 data-vertical:self-center"
      />
      <Breadcrumb className={clsx("min-w-0 max-md:hidden")}>
        <BreadcrumbList className={clsx("flex-nowrap")}>
          <BreadcrumbItem className={clsx("hidden sm:inline-flex")}>
            {section}
          </BreadcrumbItem>
          <BreadcrumbSeparator className={clsx("hidden sm:inline-flex")} />
          <BreadcrumbItem className={clsx("min-w-0")}>
            <BreadcrumbPage className={clsx("truncate")}>
              {title}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
};

/** The page's content column: centred, padded, phone-friendly. */
export const AppPageBody: FC<PropsWithChildren<{ className?: string }>> = ({
  children,
  className,
}) => (
  <div
    className={clsx(
      "mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6 lg:p-8",
      // Clear of the phone's tab bar and home indicator.
      "pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6 lg:pb-8",
      // The phone's top bar floats: start just under the status bar.
      "max-md:pt-[calc(1.25rem+env(safe-area-inset-top))]",
      className,
    )}
  >
    {children}
  </div>
);

interface AppPageHeadingProps {
  title: string;
  description?: string;
  /** Buttons aligned with the title, stacked under it on phones. */
  actions?: ReactNode;
  /** An underline tab bar (`AppPageTabsList`) under the heading. */
  tabs?: ReactNode;
}

/**
 * Title, description and actions at the top of the content column, then the
 * page's tabs on a full-width hairline: the Vercel / Stripe page heading.
 */
export const AppPageHeading: FC<AppPageHeadingProps> = ({
  title,
  description,
  actions,
  tabs,
}) => (
  <div className={clsx("flex flex-col gap-5")}>
    <div
      className={clsx(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
      )}
    >
      <div className={clsx("min-w-0")}>
        <h1
          {...{ [PAGE_TITLE_ATTRIBUTE]: "" }}
          className={clsx(
            "truncate tracking-tight",
            // An iOS large title on phones, a dashboard heading above.
            "text-[2rem] leading-tight font-bold md:text-2xl md:font-semibold",
          )}
        >
          {title}
        </h1>
        {description && (
          <p className={clsx("mt-1 text-sm text-muted-foreground")}>
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className={clsx("flex shrink-0 flex-wrap items-center gap-2")}>
          {actions}
        </div>
      )}
    </div>
    {tabs}
  </div>
);

/**
 * The page's tabs. On phones, an iOS 26 segmented control: a capsule across
 * the width, labels only. Above, underline tabs on a full-width border:
 * triggers sized to their label, the active one marked by a 2 px bar on the
 * hairline.
 */
export const AppPageTabsList: FC<PropsWithChildren> = ({ children }) => {
  const { isMobile } = useSidebar();

  if (isMobile) {
    return (
      <TabsList
        className={clsx(
          "h-auto! w-full bg-foreground/[0.06] p-1 [&_svg]:hidden",
          "dark:bg-white/10",
        )}
      >
        {children}
      </TabsList>
    );
  }

  return (
    <div className={clsx("-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0")}>
      <TabsList
        variant="line"
        className={clsx(
          "h-auto! w-full min-w-max justify-start gap-6 rounded-none border-b p-0",
        )}
      >
        {children}
      </TabsList>
    </div>
  );
};

/**
 * One tab of `AppPageTabsList`: sized to its label, its active bar drawn
 * on the list's hairline (inside the scroll box, so it is never clipped).
 */
export const AppPageTab: FC<PropsWithChildren<{ value: string }>> = ({
  value,
  children,
}) => {
  const { isMobile } = useSidebar();

  return (
    <TabsTrigger
      value={value}
      className={clsx(
        isMobile
          ? clsx(
              "h-9 flex-1 text-[0.8125rem]",
              "data-active:bg-card data-active:shadow-[0_2px_8px_-2px_rgb(0_0_0/0.18)]",
            )
          : [
              "h-10 flex-none rounded-none px-0.5",
              // The underline: full width, on the list's hairline.
              "after:inset-x-0 after:bottom-[-1px]! after:h-0.5",
            ],
      )}
    >
      {children}
    </TabsTrigger>
  );
};
