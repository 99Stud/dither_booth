import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import { INCH_TO_MM, MBP_2018_13_DPI } from "#lib/constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const mmToPx = (mm: number) => {
  return ((mm / INCH_TO_MM) * MBP_2018_13_DPI) / window.devicePixelRatio;
};
