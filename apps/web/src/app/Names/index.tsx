import { NamesHudKeyboard } from "#app/Names/internal/NamesHudKeyboard.tsx";
import { buttonVariants } from "#components/ui/button.tsx";
import { Spinner } from "#components/ui/spinner.tsx";
import { useElementHeight } from "#lib/hooks/use-element-height.ts";
import {
  DEFAULT_BOOTH_TICKET_DISPLAY_NAMES,
  MAX_TICKET_NAME_LENGTH,
  MAX_TICKET_NAMES,
  normalizeTicketNames,
  sanitizeTicketNameInput,
  ticketNamesToBoothSearchRecord,
} from "#lib/ticket-names.ts";
import { useTRPC } from "#lib/trpc/trpc.utils.ts";
import { cn } from "#lib/utils.ts";
import { validateTicketNames } from "@dither-booth/moderation";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FC, useEffect, useMemo, useRef, useState } from "react";

type NameRow = {
  id: number;
  value: string;
};

const NAMES_KEYBOARD_ELEMENT_ID = "names-hud-keyboard";

export const Names: FC = () => {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const { data: printConfig, isLoading: isLoadingPrintConfig } = useQuery(
    trpc.getDitherConfiguration.queryOptions(),
  );

  useEffect(() => {
    if (isLoadingPrintConfig) {
      return;
    }
    if (printConfig?.namesEntryEnabled !== true) {
      void navigate({
        to: "/booth",
        search: ticketNamesToBoothSearchRecord([
          ...DEFAULT_BOOTH_TICKET_DISPLAY_NAMES,
        ]),
      });
    }
  }, [isLoadingPrintConfig, printConfig, navigate]);

  const keyboardStackPx = useElementHeight(NAMES_KEYBOARD_ELEMENT_ID, 280);
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

    void navigate({
      to: "/booth",
      search: ticketNamesToBoothSearchRecord(names),
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

  const contentBottomPad = keyboardStackPx + 12;

  if (isLoadingPrintConfig || printConfig?.namesEntryEnabled !== true) {
    return (
      <div className="relative flex h-dvh min-h-dvh touch-none flex-col overflow-hidden overscroll-none text-foreground">
        <div className="relative z-10 flex flex-1 items-center justify-center">
          <Spinner className="size-10 text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-dvh min-h-dvh touch-none flex-col overflow-hidden overscroll-none text-foreground">
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div
          className="mx-auto flex w-full min-h-0 max-w-2xl flex-1 flex-col overflow-y-auto overscroll-contain px-[max(1.25rem,calc(1rem+2.5rem))] py-6 sm:max-w-3xl sm:px-10 sm:py-8 [@media(max-height:720px)]:py-4"
          style={{
            paddingBottom: `${contentBottomPad}px`,
          }}
        >
          <div className="flex flex-col gap-5 rounded-sm border border-primary/35 bg-background/70 p-5 shadow-[0_8px_48px_-8px_oklch(0_0_0/0.65),inset_0_1px_0_0_oklch(0.85_0.06_48/0.06)] backdrop-blur-sm sm:gap-7 sm:p-7 [@media(max-height:720px)]:gap-4 [@media(max-height:720px)]:p-4">
            <header className="font-heading text-center">
              <h1 className="hud-text-glow-orange text-lg leading-tight tracking-[0.12em] text-primary uppercase sm:text-2xl lg:text-3xl [@media(max-height:720px)]:text-base">
                Qui êtes-vous ?
              </h1>
            </header>

            <section className="flex flex-col gap-5 sm:gap-7 [@media(max-height:720px)]:gap-3">
              <p
                className="rounded-sm border border-primary/15 bg-muted/40 py-2.5 pr-3 pl-4 font-mono text-[11px] leading-relaxed text-foreground/90 sm:py-3 sm:text-sm [@media(max-height:720px)]:py-2 [@media(max-height:720px)]:text-[10px]"
                id="names-keyboard-hint"
              >
                <span className="mr-2 text-[10px] tracking-[0.35em] text-primary uppercase">
                  Msg
                </span>
                Touchez l’un des noms (01…), puis utilisez le clavier en bas de l’écran.
              </p>

              <div className="flex flex-col gap-3 sm:gap-4 [@media(max-height:720px)]:gap-2">
                <p className="font-mono text-[10px] tracking-[0.28em] text-primary uppercase sm:text-[11px]">
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
                        "border-primary/50 bg-card/90",
                        activeRowId === row.id &&
                          "border-primary bg-primary/15 shadow-[0_0_20px_oklch(0.7_0.2_48/0.25)]",
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
                            ? "text-foreground/50"
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
                        "border-dashed border-primary/50 bg-card/50",
                        !lastRowHasContent && "opacity-40",
                      )}
                      onClick={addRow}
                    >
                      +
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2.5 sm:gap-3 [@media(max-height:720px)]:gap-2">
                <p className="font-mono text-[10px] tracking-[0.28em] text-primary uppercase sm:text-[11px]">
                  Saisie · {String(activeRowIndex + 1).padStart(2, "0")}
                </p>
                <label className="relative min-w-0 rounded-sm bg-muted/25 px-3 pt-5 pb-1 font-mono sm:px-4 sm:pt-7 [@media(max-height:720px)]:pt-4">
                  <span className="sr-only">Prénom {activeRowIndex + 1}</span>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute top-3 left-3 h-2 w-2 border-l border-t border-primary/60 sm:left-4"
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute top-3 right-3 h-2 w-2 border-r border-t border-primary/60 sm:right-4"
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
                      "h-12 w-full min-h-12 border-0 border-b-2 bg-transparent px-1 pt-1 pb-2 text-base text-foreground sm:h-16 sm:min-h-16 sm:pb-3 sm:text-lg [@media(max-height:720px)]:h-11 [@media(max-height:720px)]:min-h-11 [@media(max-height:720px)]:text-[15px]",
                      "rounded-none placeholder:text-foreground/45",
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
                      "self-start font-mono text-[11px] tracking-[0.18em] text-foreground/80 uppercase",
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
            </section>
          </div>
        </div>
      </div>

      <NamesHudKeyboard
        activeFieldLabel={activeFieldLabel}
        onBackspace={backspace}
        onContinue={submit}
        onKeyPress={insertCharacter}
      />
    </div>
  );
};
