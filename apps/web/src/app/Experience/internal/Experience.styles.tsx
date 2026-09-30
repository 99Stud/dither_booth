import clsx from "clsx";

export const kioskButtonClassName = clsx(
  "h-18 px-6",
  "cursor-pointer border border-white/50 bg-primary/60 backdrop-blur-sm",
  "shadow-glow",
);

export const kioskButtonLabelClassName = clsx(
  "text-5xl leading-none font-bold uppercase",
);

export const glowPanelClassName = clsx(
  "border border-white/50 bg-primary/60 backdrop-blur-sm",
  "shadow-glow",
);

export const experienceStageClassName = clsx(
  "pointer-events-none fixed inset-0",
  "font-bit text-white/90 text-shadow-glow",
);
