import type { FC, ReactNode } from "react";

import clsx from "clsx";

export interface HealthTooltipItem {
  label: string;
  value?: ReactNode;
}

interface HealthTooltipListProps {
  items: HealthTooltipItem[];
  message?: ReactNode;
}

export const HealthTooltipList: FC<HealthTooltipListProps> = ({
  items,
  message,
}) => {
  const visibleItems = items.filter(
    (item) => item.value !== undefined && item.value !== null,
  );
  const hasMessage = message !== undefined && message !== null;

  if (visibleItems.length === 0 && !hasMessage) {
    return null;
  }

  return (
    <div className={clsx("space-y-1")}>
      {hasMessage && <p>{message}</p>}
      {visibleItems.length > 0 && (
        <ul className={clsx("space-y-0.5", "list-inside list-disc")}>
          {visibleItems.map((item) => (
            <li key={item.label}>
              <span className={clsx("font-semibold")}>{item.label}: </span>
              {item.value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
