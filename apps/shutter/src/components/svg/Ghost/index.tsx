import type { FC, SVGProps } from "react";

/** A 24×24 pixel ghost, drawn like the pixelarticons set it sits beside. */
export const Ghost: FC<SVGProps<SVGSVGElement>> = (props) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <path d="M16 20v2H4v-2zM6 16v2H4v2H2v-4zm12 2v2h-2v-2zm2-2v2h-2v-2zM8 4v12H6V4zm14 2v10h-2V6zm-6 6v2h-4v-2zm-2-4v2h-2V8zm4 0v2h-2V8zm2-4v2h-2V4zm-2-2v2H8V2z" />
    </svg>
  );
};
