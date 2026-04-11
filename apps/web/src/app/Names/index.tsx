import { NamesHudKeyboard } from "#app/Names/internal/NamesHudKeyboard.tsx";
import { buttonVariants } from "#components/ui/button.tsx";
import {
  MAX_TICKET_NAME_LENGTH,
  MAX_TICKET_NAMES,
  normalizeTicketNames,
  sanitizeTicketNameInput,
  serializeTicketSearch,
} from "#lib/ticket-names.ts";
import { cn } from "#lib/utils.ts";
import { validateTicketNames } from "@dither-booth/moderation";
import { useNavigate } from "@tanstack/react-router";
import { type FC, useMemo, useRef, useState } from "react";

type NameRow = {
  id: number;
  value: string;
};

export const Names: FC = () => {
  const navigate = useNavigate();
  const nextIdRef = useRef(1);
  const [rows, setRows] = useState<NameRow[]>([{ id: 0, value: "" }]);
  const [activeRowId, setActiveRowId] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const addRow = () => {
    if (rows.length >= MAX_TICKET_NAMES) {
      return;
    }

    const last = rows[rows.length - 1];
    if (!last || sanitizeTicketNameInput(last.value).trim().length === 0) {
      setError("Remplissez le champ avant d’ajouter un nom.");
      return;
    }

    const id = nextIdRef.current;
    nextIdRef.current += 1;
    setRows((prev) => [...prev, { id, value: "" }]);
    setActiveRowId(id);
    setError(null);
  };

  const removeRow = (id: number) => {
    if (rows.length <= 1) {
      return;
    }

    const nextRows = rows.filter((row) => row.id !== id);
    setRows(nextRows);
    if (activeRowId === id) {
      setActiveRowId(nextRows.at(-1)?.id ?? nextRows[0]?.id ?? 0);
    }
    setError(null);
  };

  const insertCharacter = (value: string) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === activeRowId
          ? {
              ...row,
              value: sanitizeTicketNameInput(`${row.value}${value}`),
            }
          : row,
      ),
    );
    setError(null);
  };

  const backspace = () => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === activeRowId
          ? {
              ...row,
              value: row.value.slice(0, -1),
            }
          : row,
      ),
    );
    setError(null);
  };

  const submit = () => {
    const names = normalizeTicketNames(rows.map((row) => row.value));
    if (names.length === 0) {
      setError("Indiquez au moins un prénom.");
      return;
    }

    const validation = validateTicketNames(names);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    const query = serializeTicketSearch({ ticket: names }).replace(/^\?/, "");
    navigate({
      to: "/booth",
      search: Object.fromEntries(new URLSearchParams(query)),
    });
  };

  const canAddMore = rows.length < MAX_TICKET_NAMES;
  const lastRowHasContent = useMemo(() => {
    const last = rows[rows.length - 1];
    return last ? sanitizeTicketNameInput(last.value).trim().length > 0 : false;
  }, [rows]);
  const activeRowIndex = useMemo(
    () => rows.findIndex((row) => row.id === activeRowId),
    [activeRowId, rows],
  );
  const activeRow = useMemo(() => {
    return rows.find((row) => row.id === activeRowId) ?? rows[0];
  }, [activeRowId, rows]);
  const activeFieldLabel = activeRowIndex >= 0 ? `Champ ${activeRowIndex + 1}` : "Aucun champ";

  const slotPreview = (value: string) => {
    const t = sanitizeTicketNameInput(value).trim();
    if (t.length === 0) {
      return "—";
    }
    return t.length > 7 ? `${t.slice(0, 7)}…` : t;
  };

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

      <div
        className="relative z-10 mx-auto flex w-full max-w-2xl flex-col gap-6 px-[max(1.25rem,calc(1rem+2.5rem))] py-8 sm:max-w-3xl sm:gap-8 sm:px-10 sm:py-12"
        style={{ paddingBottom: "calc(20rem + env(safe-area-inset-bottom))" }}
      >
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

        <section className="flex flex-col gap-6 sm:gap-8">
          <p
            className="border-l-2 border-primary/50 pl-4 font-mono text-xs leading-relaxed text-muted-foreground sm:text-sm"
            id="names-keyboard-hint"
          >
            <span className="mr-2 text-[10px] tracking-[0.35em] text-primary/70 uppercase">
              Msg
            </span>
            Touchez l’un des noms (01…), puis utilisez le clavier en bas de l’écran.
          </p>

          <div className="flex flex-col gap-4">
            <p className="font-mono text-[10px] tracking-[0.28em] text-primary/60 uppercase sm:text-[11px]">
              Noms
            </p>
            <div
              className="flex flex-wrap items-stretch gap-2 sm:gap-2.5"
              role="tablist"
              aria-label="Noms"
            >
              {rows.map((row, index) => (
                <button
                  key={row.id}
                  type="button"
                  role="tab"
                  aria-selected={activeRowId === row.id}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "touch" }),
                    "flex h-auto min-h-13 min-w-19 shrink-0 flex-col items-center justify-center gap-0.5 px-2 py-2 font-mono sm:min-w-21",
                    "border-primary/40 bg-background/40",
                    activeRowId === row.id &&
                      "border-primary bg-primary/10 shadow-[0_0_20px_oklch(0.7_0.2_48/0.2)]",
                  )}
                  onClick={() => {
                    setActiveRowId(row.id);
                    setError(null);
                  }}
                >
                  <span className="text-[10px] tracking-[0.24em] text-primary/80 uppercase">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={cn(
                      "max-w-22 truncate text-center text-[11px] leading-tight tracking-wide sm:text-xs",
                      sanitizeTicketNameInput(row.value).trim().length === 0
                        ? "text-muted-foreground/55"
                        : "text-foreground",
                    )}
                  >
                    {slotPreview(row.value)}
                  </span>
                </button>
              ))}
              {canAddMore && (
                <button
                  type="button"
                  disabled={!lastRowHasContent}
                  title={
                    lastRowHasContent
                      ? undefined
                      : "Remplissez le champ actuel avant d’ajouter un autre nom."
                  }
                  className={cn(
                    buttonVariants({ variant: "outline", size: "touch" }),
                    "flex min-h-13 min-w-13 shrink-0 items-center justify-center px-2 font-mono text-lg text-primary sm:min-w-14",
                    "border-dashed border-primary/45 bg-transparent",
                    !lastRowHasContent && "opacity-40",
                  )}
                  onClick={addRow}
                >
                  +
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <p className="font-mono text-[10px] tracking-[0.28em] text-primary/60 uppercase sm:text-[11px]">
              Saisie · {String(activeRowIndex + 1).padStart(2, "0")}
            </p>
            <label className="relative min-w-0 font-mono">
              <span className="sr-only">Prénom {activeRowIndex + 1}</span>
              <span
                aria-hidden
                className="pointer-events-none absolute top-2 left-0 h-2 w-2 border-l border-t border-primary/50"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute top-2 right-0 h-2 w-2 border-r border-t border-primary/50"
              />
              <input
                key={activeRowId}
                type="text"
                name={`name-${activeRow?.id ?? 0}`}
                value={activeRow?.value ?? ""}
                aria-describedby="names-keyboard-hint"
                aria-readonly="true"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                inputMode="none"
                placeholder="Prénom"
                maxLength={MAX_TICKET_NAME_LENGTH}
                readOnly
                spellCheck={false}
                onClick={() => {
                  if (activeRow) {
                    setActiveRowId(activeRow.id);
                  }
                }}
                onFocus={() => {
                  if (activeRow) {
                    setActiveRowId(activeRow.id);
                  }
                }}
                className={cn(
                  "h-14 w-full min-h-14 border-0 border-b-2 bg-transparent px-3 pt-2 pb-2 text-base text-foreground sm:h-16 sm:min-h-16 sm:px-4 sm:pt-3 sm:pb-3 sm:text-lg",
                  "rounded-none placeholder:text-muted-foreground/45",
                  "focus:border-primary focus:shadow-[0_12px_40px_-8px_oklch(0.7_0.2_48/0.35)] focus:ring-0 focus:outline-none",
                  "hud-text-glow-orange-soft",
                  "border-primary text-primary [text-shadow:0_0_12px_oklch(0.72_0.18_48/0.45)]",
                )}
              />
            </label>
            {rows.length > 1 && (
              <button
                type="button"
                aria-label={`Retirer le prénom ${activeRowIndex + 1}`}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "self-start font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase",
                )}
                onClick={() => {
                  if (activeRow) {
                    removeRow(activeRow.id);
                  }
                }}
              >
                Retirer ce prénom
              </button>
            )}
          </div>

          {error && (
            <p className="font-mono text-sm text-destructive sm:text-base" role="alert">
              {error}
            </p>
          )}

          <div className="border-t border-primary/20 pt-2">
            <button
              type="button"
              className={cn(
                buttonVariants({ variant: "hud", size: "touch" }),
                "hud-cta-pulse w-full min-h-16 justify-center text-base sm:min-h-17 sm:text-lg",
              )}
              onClick={submit}
            >
              Continuer
            </button>
          </div>
        </section>
      </div>

      <NamesHudKeyboard
        activeFieldLabel={activeFieldLabel}
        onBackspace={backspace}
        onKeyPress={insertCharacter}
      />
    </div>
  );
};
