import { haptic } from "@dither-booth/ui/haptics";
import { toast } from "sonner";

/** Closes the on-screen keyboard once the field it served is done with. */
const dismissKeyboard = () => {
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && focused.matches("input, textarea")) {
    focused.blur();
  }
};

/**
 * Outcome feedback: a toast, with the matching haptic on phones and the
 * iPad. A success also closes the keyboard, as iOS forms do after Done.
 */
export const notify = {
  success: (message: string) => {
    haptic("success");
    dismissKeyboard();
    toast.success(message);
  },
  warning: (message: string) => {
    haptic("warning");
    toast.warning(message);
  },
  error: (message: string) => {
    haptic("error");
    toast.error(message);
  },
};
