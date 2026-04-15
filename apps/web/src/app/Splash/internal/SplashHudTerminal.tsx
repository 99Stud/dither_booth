import { appendTerminalLine, getTerminalLine } from "#app/Splash/internal/SplashHud.utils.ts";
import { type FC, useEffect, useState } from "react";

const MAX_TERMINAL_LINES = 7;

const createInitialLines = () =>
  Array.from({ length: MAX_TERMINAL_LINES }, (_, index) => getTerminalLine(index));

export const SplashHudTerminal: FC<{ reduceMotion: boolean }> = (props) => {
  const { reduceMotion } = props;

  const [lines, setLines] = useState(createInitialLines);

  useEffect(() => {
    if (reduceMotion) {
      setLines(createInitialLines());
      return;
    }

    let step = MAX_TERMINAL_LINES;
    const interval = window.setInterval(() => {
      setLines((currentLines) =>
        appendTerminalLine(currentLines, getTerminalLine(step++), MAX_TERMINAL_LINES),
      );
    }, 880);

    return () => {
      window.clearInterval(interval);
    };
  }, [reduceMotion]);

  return (
    <div
      aria-hidden="true"
      className="border border-primary/40 px-3 py-3 shadow-[0_0_30px_oklch(0.7_0.2_48/0.08)] backdrop-blur-sm"
    >
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-primary/25 pb-2 font-mono text-[9px] uppercase">
        <span className="hud-text-glow-orange tracking-[0.22em]">99_stud feed</span>
        <span className="hud-text-glow-orange-soft tracking-[0.2em]">
          Active
          <span aria-hidden className="hud-cursor-blink ml-1 inline-block">
            *
          </span>
        </span>
      </div>

      <div className="space-y-1 font-mono text-[9px] leading-relaxed text-muted-foreground sm:text-[10px]">
        {lines.map((line, index) => (
          <p key={`${index}-${line}`} className="hud-text-glow-orange-soft wrap-break-word">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
};
