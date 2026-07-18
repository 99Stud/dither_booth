export const requestKioskFullscreen = async (): Promise<void> => {
  if (typeof document === "undefined" || document.fullscreenElement) {
    return;
  }

  const root = document.documentElement;

  try {
    if (root.requestFullscreen) {
      await root.requestFullscreen();
      return;
    }
  } catch {
    // Safari / iOS often reject or omit document fullscreen; PWA meta still applies.
  }

  try {
    const wk = root as unknown as { webkitRequestFullscreen?: () => void };
    if (typeof wk.webkitRequestFullscreen === "function") {
      wk.webkitRequestFullscreen();
    }
  } catch {
    // ignore
  }
};

export const installKioskFullscreen = (): (() => void) => {
  void requestKioskFullscreen();

  const reenterFullscreen = () => {
    if (!document.fullscreenElement) {
      void requestKioskFullscreen();
    }
  };

  document.addEventListener("fullscreenchange", reenterFullscreen);

  const requestOnFirstInteraction = () => {
    void requestKioskFullscreen();
    document.removeEventListener("pointerdown", requestOnFirstInteraction);
    document.removeEventListener("touchstart", requestOnFirstInteraction);
  };

  document.addEventListener("pointerdown", requestOnFirstInteraction, {
    passive: true,
  });
  document.addEventListener("touchstart", requestOnFirstInteraction, {
    passive: true,
  });

  const reenterOnVisible = () => {
    if (document.visibilityState === "visible") {
      void requestKioskFullscreen();
    }
  };

  document.addEventListener("visibilitychange", reenterOnVisible);

  return () => {
    document.removeEventListener("fullscreenchange", reenterFullscreen);
    document.removeEventListener("pointerdown", requestOnFirstInteraction);
    document.removeEventListener("touchstart", requestOnFirstInteraction);
    document.removeEventListener("visibilitychange", reenterOnVisible);
  };
};
