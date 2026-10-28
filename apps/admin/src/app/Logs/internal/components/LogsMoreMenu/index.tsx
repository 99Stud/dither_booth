import type { FC } from "react";

import { Button } from "@dither-booth/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dither-booth/ui/components/ui/dropdown-menu";
import { Download, FilterX, Link2, MoreHorizontal } from "lucide-react";

interface LogsMoreMenuProps {
  hasFilter: boolean;
  hasLines: boolean;
  onCopyLink: () => void;
  onDownload: () => void;
  onClearFilters: () => void;
}

/** The page's less frequent actions, behind ⋯. */
export const LogsMoreMenu: FC<LogsMoreMenuProps> = ({
  hasFilter,
  hasLines,
  onCopyLink,
  onDownload,
  onClearFilters,
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" />}>
      <MoreHorizontal />
      <span className="sr-only">More log actions</span>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={6} className="w-auto">
      <DropdownMenuItem onClick={onCopyLink}>
        <Link2 />
        Copy link to this view
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!hasLines} onClick={onDownload}>
        <Download />
        Download lines (.ndjson)
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={!hasFilter} onClick={onClearFilters}>
        <FilterX />
        Clear filters
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);
