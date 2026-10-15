import type { FC, PropsWithChildren, ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@dither-booth/ui/components/ui/breadcrumb";
import { Separator } from "@dither-booth/ui/components/ui/separator";
import { SidebarTrigger } from "@dither-booth/ui/components/ui/sidebar";
import { TabsList, TabsTrigger } from "@dither-booth/ui/components/ui/tabs";
import clsx from "clsx";

interface AppSidebarPageHeaderProps {
  /** The current page, last in the breadcrumb. */
  title: string;
  /** The page's section, before it in the breadcrumb (e.g. "Booth"). */
  section?: string;
}

/**
 * The slim top bar of every page, as on Vercel's and Linear's dashboards:
 * sidebar toggle and a breadcrumb. The page's own title lives in
 * `AppPageHeading`, aligned with its content.
 */
export const AppSidebarPageHeader: FC<AppSidebarPageHeaderProps> = ({
  title,
  section = "Booth",
}) => {
  return (
    <header
      className={clsx(
        "sticky top-0 z-20",
        "flex h-12 shrink-0 items-center gap-2 px-4",
        "border-b bg-background/85 backdrop-blur",
        "md:rounded-t-xl",
      )}
    >
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-1 data-vertical:h-4 data-vertical:self-center"
      />
      <Breadcrumb className={clsx("min-w-0")}>
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
        <h1 className={clsx("truncate text-2xl font-semibold tracking-tight")}>
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
 * Underline tabs on a full-width border: triggers sized to their label, the
 * active one marked by a 2 px bar sitting on the hairline. Scrolls sideways
 * on phones instead of wrapping.
 */
export const AppPageTabsList: FC<PropsWithChildren> = ({ children }) => (
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

/**
 * One tab of `AppPageTabsList`: sized to its label, its active bar drawn
 * on the list's hairline (inside the scroll box, so it is never clipped).
 */
export const AppPageTab: FC<PropsWithChildren<{ value: string }>> = ({
  value,
  children,
}) => (
  <TabsTrigger
    value={value}
    className={clsx(
      "h-10 flex-none rounded-none px-0.5",
      // The underline: full width, on the list's hairline.
      "after:inset-x-0 after:bottom-[-1px]! after:h-0.5",
    )}
  >
    {children}
  </TabsTrigger>
);
