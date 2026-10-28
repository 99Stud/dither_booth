import type { FC } from "react";

import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dither-booth/ui/components/ui/tabs";

export type SystemRange = "recent" | "hour";

const RANGES: Array<{ value: SystemRange; label: string }> = [
  { value: "recent", label: "15 min" },
  { value: "hour", label: "1 h" },
];

/** How far back the charts show: the same history, cut shorter. */
export const SystemRangeTabs: FC<{
  value: SystemRange;
  onChange: (range: SystemRange) => void;
}> = ({ value, onChange }) => (
  <Tabs value={value} onValueChange={(next) => onChange(next as SystemRange)}>
    <TabsList aria-label="Chart range">
      {RANGES.map((range) => (
        <TabsTrigger key={range.value} value={range.value}>
          {range.label}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
);
