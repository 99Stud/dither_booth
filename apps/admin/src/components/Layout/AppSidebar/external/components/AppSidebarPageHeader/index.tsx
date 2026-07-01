import type { FC, PropsWithChildren } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@dither-booth/ui/components/ui/breadcrumb";
import { Separator } from "@dither-booth/ui/components/ui/separator";
import { SidebarTrigger } from "@dither-booth/ui/components/ui/sidebar";

interface AppSidebarPageHeaderProps extends PropsWithChildren {
  title: string;
}

export const AppSidebarPageHeader: FC<AppSidebarPageHeaderProps> = ({
  title,
  children,
}) => {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mt-1.5 mr-2 data-[orientation=vertical]:h-4"
        />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage className="text-lg font-medium">
                {title}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      {children}
    </header>
  );
};
