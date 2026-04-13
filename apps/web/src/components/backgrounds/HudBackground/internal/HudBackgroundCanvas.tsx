import { type FC, useEffect, useRef, useState } from "react";

type WebGPUProbe = { ok: true } | { ok: false; reason: string };

function missingGpuReason(): string {
  const secure = typeof window !== "undefined" && window.isSecureContext;
  if (!secure) {
    return (
      "navigator.gpu is unavailable: this origin is not a secure context. " +
      "WebGPU only works on https:// or on http://localhost / http://127.0.0.1 — " +
      "opening the dev server as http://<your-LAN-IP> from iPad will not expose WebGPU."
    );
  }
  return (
    "navigator.gpu is missing. Enable WebGPU under Settings → Apps → Safari → Advanced → Feature Flags " +
    "(or Safari → Advanced → Feature Flags), then fully quit Safari and reopen this tab."
  );
}

async function probeWebGPU(): Promise<WebGPUProbe> {
  if (typeof navigator === "undefined" || !("gpu" in navigator) || !navigator.gpu) {
    return { ok: false, reason: missingGpuReason() };
  }
  try {
    let adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) {
      adapter = await navigator.gpu.requestAdapter();
    }
    if (!adapter) {
      return { ok: false, reason: "requestAdapter() returned null (no usable GPU adapter)" };
    }
    return { ok: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `requestAdapter() failed: ${msg}` };
  }
}

export const HudBackgroundCanvas: FC<{ onFallback: () => void }> = (props) => {
  const { onFallback } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const envRef = useRef<import("./renderer/backgroundEnvironment.ts").BackgroundEnvironment | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;

    const boot = async () => {
      try {
        const probe = await probeWebGPU();
        if (disposed) return;
        if (!probe.ok) {
          console.warn("[HudBackground] CSS grid fallback —", probe.reason);
          setFailed(true);
          onFallback();
          return;
        }

        const { BackgroundEnvironment } = await import("./renderer/backgroundEnvironment.ts");
        if (disposed) return;

        const env = new BackgroundEnvironment();
        envRef.current = env;
        env.mountTo(container);
        await env.init();

        if (disposed) {
          env.dispose();
          envRef.current = null;
          return;
        }

        env.start();
      } catch (error) {
        console.error("[HudBackground] WebGPU background failed to start", error);
        if (!disposed) {
          setFailed(true);
          onFallback();
        }
      }
    };

    void boot();

    return () => {
      disposed = true;
      if (envRef.current) {
        envRef.current.dispose();
        envRef.current = null;
      }
    };
  }, [onFallback]);

  if (failed) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-0 h-lvh w-lvw max-h-none max-w-none [&>canvas]:block! [&>canvas]:h-full! [&>canvas]:w-full!"
    />
  );
};
