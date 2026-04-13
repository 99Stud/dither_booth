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
