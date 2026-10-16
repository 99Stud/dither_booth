import type { BackgroundPreset } from "@dither-booth/shared/backgrounds";

import { useEffect, useRef } from "react";

import type { ThreeEnvironment } from "#lib/three/index";

import { createThreeEnvironment } from "#lib/three/index";

interface InteractiveBackgroundProps {
  className?: string;
  /** The look to show. A new one updates the running shader in place. */
  preset: BackgroundPreset;
}

export const InteractiveBackground = ({
  className = "fixed inset-0",
  preset,
}: InteractiveBackgroundProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const envRef = useRef<ThreeEnvironment | null>(null);
  const presetRef = useRef(preset);
  presetRef.current = preset;

  // One WebGPU environment for the component's life: rebuilding it would
  // drop the frame rate and the fluid's state on every kit save.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let env: ThreeEnvironment | null = null;

    const bootstrapThree = async () => {
      try {
        env = createThreeEnvironment({
          container,
          background: presetRef.current,
        });
        envRef.current = env;
        await env.init();
        if (cancelled) {
          env.dispose();
          return;
        }
        // A preset that changed while WebGPU was starting.
        env.apply(presetRef.current);
        env.start();
      } catch (error) {
        env?.dispose();
        if (!cancelled) {
          console.error("Failed to initialize the Three.js background.", error);
        }
      }
    };

    void bootstrapThree();

    return () => {
      cancelled = true;
      envRef.current = null;
      env?.dispose();
    };
  }, []);

  useEffect(() => {
    envRef.current?.apply(preset);
  }, [preset]);

  return <div ref={containerRef} className={className} />;
};
