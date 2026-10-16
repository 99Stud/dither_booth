import type { FC, ReactNode } from "react";

import CRTEffect from "vault66-crt-effect";

import { useKit } from "#kits/useKit";

/** The kit look's opacities, at strength 50. */
const SCANLINE_OPACITY = 0.28;
const SWEEP_OPACITY = 0.55;
const WASH_OPACITY = 0.16;

const toRgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ");

/**
 * Minimal CRT on the camera square, as the kit sets it: scanlines and a
 * sweep, and a light screen wash in the tint (by default the shader's
 * highlight, so the photo sits in the background's colour). `isolate` keeps
 * the library's overlay z-index inside the picture.
 */
export const CameraCrt: FC<{ children: ReactNode }> = (props) => {
  const { children } = props;
  const { crtLines, wash, tint, strength } = useKit().camera;

  const rgb = toRgb(tint);
  // Strength 0 halves the kit's opacities, 100 doubles them.
  const scale = (opacity: number) =>
    Math.min(1, opacity * 2 ** ((strength - 50) / 50));

  // The CRT stays mounted when its lines are off (every layer disabled):
  // unwrapping the children would remount the webcam and restart its stream.
  return (
    <div className="absolute inset-0 isolate">
      <CRTEffect
        preset="minimal"
        fill
        theme="custom"
        enableScanlines={crtLines}
        enableVignette={crtLines}
        scanlineColor={`rgb(${rgb})`}
        scanlineOpacity={scale(SCANLINE_OPACITY)}
        enableSweep={crtLines}
        sweepStyle="soft"
        sweepColor={`rgba(${rgb}, ${scale(SWEEP_OPACITY)})`}
        sweepThickness={36}
        sweepDuration={8}
      >
        <div className="relative flex h-full min-h-0 w-full flex-1 flex-col">
          {children}
          {wash ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 mix-blend-screen"
              style={{
                backgroundColor: `rgba(${rgb}, ${scale(WASH_OPACITY)})`,
              }}
            />
          ) : null}
        </div>
      </CRTEffect>
    </div>
  );
};
