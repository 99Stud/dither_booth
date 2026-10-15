import { useEffect } from "react";

const EXPERIENCE_SHELL_CLASS_NAME = "experience-shell";

/**
 * Locks the document to a non-scrolling, full-height kiosk shell for as long as
 * the Experience is mounted. The rules themselves live in styles/globals.css.
 */
export const useExperienceShellClass = () => {
  useEffect(() => {
    document.documentElement.classList.add(EXPERIENCE_SHELL_CLASS_NAME);
    return () => {
      document.documentElement.classList.remove(EXPERIENCE_SHELL_CLASS_NAME);
    };
  }, []);
};
