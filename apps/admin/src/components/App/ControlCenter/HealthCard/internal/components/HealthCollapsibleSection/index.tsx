import type { FC, PropsWithChildren } from "react";

import { CollapsibleContent } from "@dither-booth/ui/components/ui/collapsible";
import {
  Collapsible,
  CollapsibleTrigger,
} from "@dither-booth/ui/components/ui/collapsible";
import clsx from "clsx";
import { ChevronsUpDown } from "lucide-react";

interface HealthCollapsibleSectionProps extends PropsWithChildren {
  title: string;
}

export const HealthCollapsibleSection: FC<HealthCollapsibleSectionProps> = ({
  children,
  title,
}) => {
  return (
    <Collapsible>
      <CollapsibleTrigger
        className={clsx(
          "flex items-center gap-1",
          "cursor-pointer",
          "font-medium",
        )}
      >
        {title}
        <ChevronsUpDown className="size-3" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className={clsx("mt-1.5 mb-1.5 ml-1", "space-y-0.5")}>
          {children}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
};
