/** Above this, a visual viewport shorter than the layout one is a keyboard. */
const KEYBOARD_MIN_HEIGHT_PX = 120;

/**
 * Follows the on-screen keyboard, which iOS Safari draws over the page
 * without resizing it. Publishes its height as `--keyboard-inset` on <html>
 * (bottom sheets sit above it) and `data-keyboard-open` (the tab bar hides,
 * as iOS hides it while typing). Returns a cleanup.
 */
export const watchVirtualKeyboard = (): (() => void) => {
  const viewport = window.visualViewport;
  if (!viewport) return () => undefined;
  const root = document.documentElement;

  const update = () => {
    const inset = Math.max(
      0,
      window.innerHeight - viewport.height - viewport.offsetTop,
    );
    root.style.setProperty("--keyboard-inset", `${Math.round(inset)}px`);
    root.toggleAttribute("data-keyboard-open", inset > KEYBOARD_MIN_HEIGHT_PX);
  };

  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
  update();

  return () => {
    viewport.removeEventListener("resize", update);
    viewport.removeEventListener("scroll", update);
    root.style.removeProperty("--keyboard-inset");
    root.removeAttribute("data-keyboard-open");
  };
};
