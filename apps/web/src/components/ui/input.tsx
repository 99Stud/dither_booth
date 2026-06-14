import * as React from "react";

import { cn } from "#lib/utils.ts";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "flex h-9 w-full rounded-none border border-input bg-transparent px-3 py-1 text-xs transition-colors",
        "file:border-0 file:bg-transparent file:text-xs file:font-medium",
        "placeholder:text-muted-foreground",
        "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
