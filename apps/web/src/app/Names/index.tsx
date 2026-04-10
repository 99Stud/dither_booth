import { buttonVariants } from "#components/ui/button.tsx";
import {
  MAX_TICKET_NAMES,
  normalizeTicketNames,
  serializeTicketSearch,
} from "#lib/ticket-names.ts";
import { cn } from "#lib/utils.ts";
import { useNavigate } from "@tanstack/react-router";
import { type FC, useRef, useState } from "react";

type NameRow = {
  id: number;
  value: string;
};

export const Names: FC = () => {
  const navigate = useNavigate();
  const nextIdRef = useRef(1);
  const [rows, setRows] = useState<NameRow[]>([{ id: 0, value: "" }]);
  const [error, setError] = useState<string | null>(null);

  const updateRow = (id: number, value: string) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, value } : row)));
    setError(null);
  };

  const addRow = () => {
    setRows((prev) => {
      if (prev.length >= MAX_TICKET_NAMES) {
        return prev;
      }
      const id = nextIdRef.current;
      nextIdRef.current += 1;
      return [...prev, { id, value: "" }];
    });
    setError(null);
  };

  const removeRow = (id: number) => {
    setRows((prev) => {
      if (prev.length <= 1) {
        return prev;
      }
      return prev.filter((row) => row.id !== id);
    });
    setError(null);
  };

  const submit = () => {
    const names = normalizeTicketNames(rows.map((row) => row.value));
    if (names.length === 0) {
      setError("Indiquez au moins un prénom.");
      return;
    }

    const query = serializeTicketSearch({ ticket: names }).replace(/^\?/, "");
    navigate({
      to: "/booth",
      search: Object.fromEntries(new URLSearchParams(query)),
    });
  };

  const canAddMore = rows.length < MAX_TICKET_NAMES;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 hud-grid-bg hud-splash-grid-animate"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 hud-cyan-columns hud-splash-cyan-animate"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 hud-scanlines hud-splash-scan-animate"
      />

      <div
        aria-hidden
        className="pointer-events-none fixed top-0 right-0 left-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent hud-splash-rail-animate"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed right-0 bottom-0 left-0 h-px bg-linear-to-r from-transparent via-primary/40 to-transparent hud-splash-rail-animate"
      />

      <div
        aria-hidden
        className="pointer-events-none fixed top-6 left-6 size-12 border-l-2 border-t-2 border-primary/70 hud-splash-bracket-animate"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed top-6 right-6 size-12 border-r-2 border-t-2 border-primary/70 hud-splash-bracket-animate"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-6 left-6 size-12 border-b-2 border-l-2 border-primary/70 hud-splash-bracket-animate"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed right-6 bottom-6 size-12 border-b-2 border-r-2 border-primary/70 hud-splash-bracket-animate"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-10 px-[max(1.25rem,calc(1rem+2.5rem))] py-12 sm:max-w-3xl sm:gap-12 sm:px-10 sm:py-16">
        <header className="font-heading text-center">
          <p className="hud-text-glow-orange-soft mb-2 text-[11px] tracking-[0.22em] text-muted-foreground uppercase sm:text-xs">
            99Stud · Dither Booth
          </p>
          <h1 className="hud-text-glow-orange text-xl leading-tight tracking-[0.12em] text-primary uppercase sm:text-2xl lg:text-3xl">
            Qui êtes-vous ?
          </h1>
          <p className="mt-3 font-mono text-sm text-muted-foreground sm:text-base">
            Jusqu’à {MAX_TICKET_NAMES} personnes
          </p>
        </header>

        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-0 -m-3 border border-primary/25 hud-splash-frame-outer-animate"
          />
          <div aria-hidden className="absolute inset-0 -m-1.5 border border-primary/45" />
          <div className="relative border-2 border-primary/55 bg-black/40 p-8 sm:p-10 lg:p-12">
            <div className="flex flex-col gap-5 sm:gap-6">
              {rows.map((row, index) => (
                <div key={row.id} className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
                  <label className="min-w-0 flex-1 font-mono">
                    <span className="sr-only">Prénom {index + 1}</span>
                    <input
                      type="text"
                      name={`name-${row.id}`}
                      value={row.value}
                      autoComplete="name"
                      placeholder="Prénom ou pseudo"
                      maxLength={80}
                      onChange={(e) => {
                        updateRow(row.id, e.target.value);
                      }}
                      className={cn(
                        "h-14 w-full min-h-14 border border-primary/40 bg-background/80 px-4 text-base text-foreground sm:h-16 sm:min-h-16 sm:px-5 sm:text-lg",
                        "placeholder:text-muted-foreground/45",
                        "focus:border-primary focus:ring-2 focus:ring-primary/35 focus:outline-none",
                        "hud-text-glow-orange-soft",
                      )}
                    />
                  </label>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Retirer le prénom ${index + 1}`}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "touch" }),
                        "shrink-0 border-primary/50 px-4 font-mono text-xs uppercase sm:min-h-16 sm:self-end sm:px-5",
                      )}
                      onClick={() => {
                        removeRow(row.id);
                      }}
                    >
                      Retirer
                    </button>
                  )}
                </div>
              ))}
            </div>

            {canAddMore && (
              <button
                type="button"
                className={cn(
                  buttonVariants({ variant: "outline", size: "touch" }),
                  "mt-6 w-full border-primary/50 font-mono text-sm uppercase tracking-wide sm:mt-8 sm:text-base",
                )}
                onClick={addRow}
              >
                + Ajouter un nom
              </button>
            )}

            {error && (
              <p className="mt-6 font-mono text-sm text-destructive sm:text-base" role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              className={cn(
                buttonVariants({ variant: "hud", size: "touch" }),
                "hud-cta-pulse mt-8 w-full min-h-16 justify-center text-base sm:mt-10 sm:min-h-17 sm:text-lg",
              )}
              onClick={submit}
            >
              Continuer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
