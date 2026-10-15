import { motion } from "motion/react";

import { FLASH_TRANSITION } from "../../Experience.motion";

interface CaptureFlashProps {
  captureId: number | null;
}

export const CaptureFlash = ({ captureId }: CaptureFlashProps) => {
  if (captureId === null) return null;

  return (
    <motion.div
      key={captureId}
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={FLASH_TRANSITION}
      className="pointer-events-none fixed inset-0 z-50 bg-white"
      aria-hidden
    />
  );
};
