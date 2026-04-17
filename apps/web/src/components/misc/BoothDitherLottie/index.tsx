import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { type CSSProperties, type FC } from "react";

import { cn } from "#lib/utils.ts";

const BOOTH_LOTTIE_SRC = "/public/ressources/anim_ditherBOOTH.lottie";

export const BoothDitherLottie: FC<{
  className?: string;
  style?: CSSProperties;
}> = (props) => {
  const { className, style } = props;
  return (
    <div
      className={cn("brightness-0 invert", className)}
      style={style}
    >
      <DotLottieReact
        src={BOOTH_LOTTIE_SRC}
        loop
        autoplay
        className="size-full"
        renderConfig={{ autoResize: true }}
      />
    </div>
  );
};
