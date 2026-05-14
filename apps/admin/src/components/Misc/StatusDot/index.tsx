import type { FC } from "react";

import clsx from "clsx";

import type { StatusDotVariant } from "./internal/StatusDot.types";

interface StatusDotProps {
  variant: StatusDotVariant;
  size?: "sm" | "md";
}

export const StatusDot: FC<StatusDotProps> = ({ variant, size = "sm" }) => {
  return (
    <div
      className={clsx(
        size === "sm" ? "size-1.5" : "size-2",
        "rounded-full transition-colors duration-500",
        variant === "pending" && "animate-pulse bg-gray-500",
        variant === "success" && "bg-green-500",
        variant === "warning" && "bg-yellow-500",
        variant === "error" && "bg-red-500",
        variant === "neutral" && "bg-gray-500",
      )}
    />
  );
};
