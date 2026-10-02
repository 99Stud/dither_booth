import type { FC, ReactNode } from "react";

import CRTEffect from "vault66-crt-effect";

/** Fluid ramp highlight (`#3edbff`) from the background shader. */
const FLUID_HIGHLIGHT = "62, 219, 255";

/**
 * Minimal CRT on the camera square. Scanlines and a light screen wash use the
 * fluid highlight so the photo sits in the same blue as the background.
 * `isolate` keeps the library's overlay z-index inside the picture.
 */
export const CameraCrt: FC<{ children: ReactNode }> = (props) => {
  const { children } = props;

  return (
    <div className="absolute inset-0 isolate">
      <CRTEffect
        preset="minimal"
        fill
        theme="custom"
        scanlineColor={`rgb(${FLUID_HIGHLIGHT})`}
        scanlineOpacity={0.28}
        enableSweep
        sweepStyle="soft"
        sweepColor={`rgba(${FLUID_HIGHLIGHT}, 0.55)`}
        sweepThickness={36}
        sweepDuration={8}
      >
        <div className="relative flex h-full min-h-0 w-full flex-1 flex-col">
          {children}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 mix-blend-screen"
            style={{ backgroundColor: `rgba(${FLUID_HIGHLIGHT}, 0.16)` }}
          />
        </div>
      </CRTEffect>
    </div>
  );
};
