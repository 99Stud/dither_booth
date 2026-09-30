import { useEffect, useRef } from "react";

import type {
  ThreeEnvironment,
  ThreeEnvironmentOptions,
} from "#lib/three/index";

import { createThreeEnvironment } from "#lib/three/index";

export type InteractiveBackgroundOptions = Omit<
  ThreeEnvironmentOptions,
  "container"
>;

interface InteractiveBackgroundProps {
  className?: string;
  options?: InteractiveBackgroundOptions;
}

export const InteractiveBackground = ({
  className = "fixed inset-0",
  options,
}: InteractiveBackgroundProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let env: ThreeEnvironment | null = null;

    const bootstrapThree = async () => {
      try {
        env = createThreeEnvironment({ container, ...options });
        await env.init();
        if (cancelled) {
          env.dispose();
          return;
        }
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
      env?.dispose();
    };
  }, [options]);

  return <div ref={containerRef} className={className} />;
};
