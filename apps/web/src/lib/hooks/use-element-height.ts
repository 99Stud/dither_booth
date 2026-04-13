import { useLayoutEffect, useState } from "react";

export const useElementHeight = (elementId: string, fallbackPx: number): number => {
  const [height, setHeight] = useState(fallbackPx);

  useLayoutEffect(() => {
    const el = document.getElementById(elementId);
    if (!el) {
      return;
    }

    const update = () => {
      setHeight(el.offsetHeight);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [elementId]);

  return height;
};
