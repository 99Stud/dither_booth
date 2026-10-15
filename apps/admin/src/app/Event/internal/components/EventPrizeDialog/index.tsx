import type { Rarity } from "@dither-booth/shared/lottery";
import type { FC, ReactNode } from "react";

import { capitalize } from "@dither-booth/shared/formatting";
import {
  RARITY_DEFAULT_WEIGHTS,
  RARITY_TYPES,
} from "@dither-booth/shared/lottery";
import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dither-booth/ui/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dither-booth/ui/components/ui/dialog";
import { Slider } from "@dither-booth/ui/components/ui/slider";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@dither-booth/ui/components/ui/toggle-group";
import { NumberField } from "@dither-booth/ui/fields/NumberField";
import { TextField } from "@dither-booth/ui/fields/TextField";
import { useForm, useStore } from "@tanstack/react-form";
import clsx from "clsx";
import {
  ChevronDown,
  Gift,
  Hourglass,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo } from "react";

import { RarityDot, rarityColor } from "#components/Misc/RarityBadge/index";
import { ValuePill } from "#components/Misc/ValuePill/index";

import type { EventPrize, PrizeFormValues } from "../../Event.types";

import {
  DEFAULT_PRIZE_FORM_VALUES,
  PRIZE_FORM_SCHEMA,
  getPrizeFormValues,
} from "../../Event.constants";
import { useGuestsPerHour } from "../../hooks/useGuestsPerHour";
import {
  PRIZE_ONE_IN_STOPS,
  closestOneInStop,
  formatDuration,
  formatOneIn,
  type OddsPrize,
  previewPrize,
  usesRarityDefaultWeight,
  weightAfterRarityChange,
  weightForPrizeChance,
} from "../../lottery-odds.utils";
import {
  DrawBar,
  DrawBarLegend,
  type DrawBarSegment,
  NO_PRIZE_COLOR,
} from "../DrawBar/index";

/** Other prizes: a mid grey, between this prize and "no prize". */
const OTHER_PRIZES_COLOR =
  "color-mix(in oklch, var(--muted-foreground) 60%, transparent)";

/** Past this, "lasts all night" reads better than a duration. */
const ALL_NIGHT_MINUTES = 12 * 60;

const FieldBlock: FC<{
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  aside?: ReactNode;
  children: ReactNode;
}> = ({ label, hint, htmlFor, aside, children }) => (
  <div className={clsx("flex flex-col gap-2")}>
    <div className={clsx("flex items-start justify-between gap-4")}>
      <div className={clsx("min-w-0")}>
        <label className={clsx("text-sm font-medium")} htmlFor={htmlFor}>
          {label}
        </label>
        {hint && (
          <p className={clsx("text-sm text-muted-foreground")}>{hint}</p>
        )}
      </div>
      {aside}
    </div>
    {children}
  </div>
);

interface EventPrizeDialogProps {
  open: boolean;
  mode: "create" | "edit";
  prize: EventPrize | null;
  /** The event's prizes and draw settings, for the live odds. */
  prizes: OddsPrize[];
  noWinWeight: number;
  winCooldownMinutes: number;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: PrizeFormValues) => Promise<void>;
}

/**
 * Add or edit a prize in plain words: what it is, how to claim it, its
 * rarity as coloured chips, and how often it comes out as "1 in N guests"
 * instead of a raw weight. A rarity brings its default weight; moving the
 * slider makes it custom for this prize, and one click restores the default. Next to it, live: one draw as a stacked bar, how
 * the prize moves the overall odds, and about how long its stock lasts.
 */
export const EventPrizeDialog: FC<EventPrizeDialogProps> = (props) => {
  const {
    open,
    mode,
    prize,
    prizes,
    noWinWeight,
    winCooldownMinutes,
    isPending,
    onOpenChange,
    onSubmit,
  } = props;
  const [guestsPerHour] = useGuestsPerHour();

  // The form's defaults and its reset on open must agree, or a re-render
  // undoes the reset.
  const initialValues = useMemo(
    (): PrizeFormValues =>
      mode === "edit" && prize
        ? getPrizeFormValues(prize)
        : DEFAULT_PRIZE_FORM_VALUES,
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- fixed while the dialog is open
    [open, mode, prize?.id],
  );

  const form = useForm({
    defaultValues: initialValues,
    validators: {
      onChange: PRIZE_FORM_SCHEMA,
      onSubmit: PRIZE_FORM_SCHEMA,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
      onOpenChange(false);
    },
  });
  const values = useStore(form.store, (state) => state.values);

  useEffect(() => {
    if (!open) return;
    form.reset(initialValues);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- reset on open/prize only
  }, [open, mode, prize?.id]);

  const stock =
    mode === "edit" && prize ? prize.remainingQuantity : values.quantity;
  const preview = previewPrize({
    prizeId: mode === "edit" ? (prize?.id ?? null) : null,
    weight: values.weight,
    quantity: stock,
    noWinWeight,
    cooldownMinutes: winCooldownMinutes,
    guestsPerHour,
    prizes,
  });
  const isWholeDraw = preview.otherWeight <= 0;
  const rarityDefaultWeight = RARITY_DEFAULT_WEIGHTS[values.rarity];
  const isRarityDefault = usesRarityDefaultWeight(values);
  const rarityDefaultChance =
    rarityDefaultWeight / (preview.otherWeight + rarityDefaultWeight);
  const prizeLabel = values.title.trim() || "This prize";

  const segments: DrawBarSegment[] = [
    {
      key: "thisPrize",
      label: prizeLabel,
      chance: preview.chance,
      color: rarityColor(values.rarity),
    },
    ...(preview.otherChance > 0
      ? [
          {
            key: "otherPrizes",
            label: "Other prizes",
            chance: preview.otherChance,
            color: OTHER_PRIZES_COLOR,
          },
        ]
      : []),
    ...(preview.noPrizeChance > 0
      ? [
          {
            key: "noPrize",
            label: "No prize",
            chance: preview.noPrizeChance,
            color: NO_PRIZE_COLOR,
          },
        ]
      : []),
  ];
  const overallChanged =
    formatOneIn(preview.winChanceBefore) !==
    formatOneIn(preview.winChanceAfter);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={clsx(
          "max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg",
        )}
      >
        <DialogHeader>
          <DialogTitle className={clsx("flex items-center gap-2.5")}>
            <IconBubble tone="rose">
              <Gift />
            </IconBubble>
            {mode === "create" ? "Add a prize" : "Edit prize"}
          </DialogTitle>
          <DialogDescription>Winners see it on their ticket.</DialogDescription>
        </DialogHeader>
        <form
          className={clsx("flex flex-col gap-5")}
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <TextField
            form={form}
            name="title"
            label="Prize"
            placeholder="A free drink"
          />
          <TextField
            form={form}
            name="winInstruction"
            label="How to claim it"
            placeholder="Show this ticket at the bar"
          />

          <form.Field name="rarity">
            {(field) => (
              <FieldBlock
                label="Rarity"
                hint="Sets its default chance, the slot machine's reveal and the ticket's badge."
              >
                <ToggleGroup
                  aria-label="Rarity"
                  className={clsx("flex-wrap")}
                  spacing={1.5}
                  size="sm"
                  variant="outline"
                  value={[field.state.value]}
                  onValueChange={(next: unknown[]) => {
                    const [rarity] = next;
                    if (!rarity) return;
                    // A prize on its rarity's default follows the new one.
                    form.setFieldValue(
                      "weight",
                      weightAfterRarityChange({
                        weight: form.getFieldValue("weight"),
                        from: field.state.value,
                        to: rarity as Rarity,
                      }),
                    );
                    field.handleChange(rarity as Rarity);
                  }}
                >
                  {RARITY_TYPES.map((rarity) => (
                    <ToggleGroupItem
                      key={rarity}
                      value={rarity}
                      className={clsx(
                        "gap-1.5 px-2.5",
                        "data-[pressed]:border-foreground/40 data-[pressed]:bg-muted",
                      )}
                    >
                      <RarityDot rarity={rarity} />
                      {capitalize(rarity)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FieldBlock>
            )}
          </form.Field>

          {mode === "create" ? (
            <NumberField
              form={form}
              name="quantity"
              label="How many you have"
              inputMode="numeric"
              min={0}
            />
          ) : prize ? (
            // Stock only moves through restock deltas, so an edit can never
            // overwrite wins that happened while the dialog was open.
            <p className={clsx("text-sm text-muted-foreground")}>
              <span className={clsx("font-medium text-foreground")}>
                {prize.remainingQuantity} left
              </span>{" "}
              of {prize.totalQuantity}. Use Restock to change the stock.
            </p>
          ) : null}

          <div
            className={clsx(
              "flex flex-col gap-4 rounded-xl border bg-muted/30 p-4",
            )}
          >
            <FieldBlock
              htmlFor="prize-chance"
              label="Chance to win it"
              hint={
                isWholeDraw
                  ? "It's the only outcome, so every guest wins it. Set a chance to win in the Lottery tab."
                  : `About ${formatOneIn(preview.chance)} guests gets it.`
              }
              aside={<ValuePill>{formatOneIn(preview.chance)}</ValuePill>}
            >
              {!isWholeDraw && (
                <div className={clsx("flex flex-col gap-1.5")}>
                  <Slider
                    id="prize-chance"
                    aria-label="Chance to win it"
                    min={0}
                    max={PRIZE_ONE_IN_STOPS.length - 1}
                    step={1}
                    value={[closestOneInStop(preview.chance)]}
                    onValueChange={(value) => {
                      const index = Array.isArray(value)
                        ? (value[0] ?? 0)
                        : (value as number);
                      const oneIn = PRIZE_ONE_IN_STOPS[index];
                      if (oneIn === undefined) return;
                      const weight = weightForPrizeChance(
                        1 / oneIn,
                        preview.otherWeight,
                      );
                      if (weight !== null) form.setFieldValue("weight", weight);
                    }}
                  />
                  <div
                    className={clsx(
                      "flex justify-between text-xs text-muted-foreground",
                    )}
                  >
                    <span>Rarely</span>
                    <span>Often</span>
                  </div>
                </div>
              )}
              <div
                className={clsx(
                  "flex min-h-6 flex-wrap items-center justify-between gap-x-3 gap-y-1",
                  "text-xs text-muted-foreground",
                )}
              >
                {isRarityDefault ? (
                  <span className={clsx("flex items-center gap-1.5")}>
                    <RarityDot rarity={values.rarity} />
                    {capitalize(values.rarity)} default
                  </span>
                ) : (
                  <>
                    <span className={clsx("flex items-center gap-1.5")}>
                      <SlidersHorizontal className={clsx("size-3.5")} />
                      Custom for this prize
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() =>
                        form.setFieldValue("weight", rarityDefaultWeight)
                      }
                    >
                      <RotateCcw data-icon="inline-start" />
                      {capitalize(values.rarity)} default (
                      {formatOneIn(rarityDefaultChance)})
                    </Button>
                  </>
                )}
              </div>
            </FieldBlock>

            <div className={clsx("flex flex-col gap-3")}>
              <span
                className={clsx("text-xs font-medium text-muted-foreground")}
              >
                One guest's draw
              </span>
              <DrawBar segments={segments} surface="var(--popover)" />
              <DrawBarLegend segments={segments} />
            </div>

            {(overallChanged || stock > 0) && (
              <ul
                className={clsx(
                  "flex flex-col gap-1.5 border-t pt-3 text-sm text-muted-foreground",
                )}
              >
                {overallChanged && (
                  <li>
                    Any prize:{" "}
                    <span className={clsx("tabular-nums")}>
                      {formatOneIn(preview.winChanceBefore)}
                    </span>{" "}
                    →{" "}
                    <span
                      className={clsx(
                        "font-medium text-foreground tabular-nums",
                      )}
                    >
                      {formatOneIn(preview.winChanceAfter)}
                    </span>{" "}
                    guests
                  </li>
                )}
                {stock > 0 && (
                  <li className={clsx("flex items-start gap-1.5")}>
                    <Hourglass className={clsx("mt-0.5 size-3.5 shrink-0")} />
                    <span>
                      At about {guestsPerHour} guests an hour,{" "}
                      {stock === 1 ? "it" : `these ${stock}`}{" "}
                      {preview.lastsMinutes === null ||
                      preview.lastsMinutes > ALL_NIGHT_MINUTES ? (
                        <span className={clsx("font-medium text-foreground")}>
                          last{stock === 1 ? "s" : ""} all night
                        </span>
                      ) : (
                        <>
                          {stock === 1 ? "goes" : "go"} in about{" "}
                          <span className={clsx("font-medium text-foreground")}>
                            {formatDuration(preview.lastsMinutes)}
                          </span>
                        </>
                      )}
                      .
                    </span>
                  </li>
                )}
              </ul>
            )}
            {stock === 0 && (
              <p className={clsx("text-sm text-muted-foreground")}>
                With none in stock, it stays out of the draw.
              </p>
            )}
          </div>

          <Collapsible>
            <CollapsibleTrigger
              render={
                <button
                  type="button"
                  className={clsx(
                    "group flex items-center gap-1 text-sm text-muted-foreground",
                    "hover:text-foreground",
                  )}
                />
              }
            >
              <ChevronDown
                className={clsx(
                  "size-4 transition-transform group-data-[panel-open]:rotate-180",
                )}
              />
              Advanced
            </CollapsibleTrigger>
            <CollapsibleContent className={clsx("pt-3")}>
              <NumberField
                form={form}
                name="weight"
                label="Weight"
                step="any"
              />
              <p className={clsx("mt-1.5 text-xs text-muted-foreground")}>
                Its weight next to the other prizes and the no-win weight. The
                chance above sets it for you; each rarity has a default (Common{" "}
                {RARITY_DEFAULT_WEIGHTS.common}, Legendary{" "}
                {RARITY_DEFAULT_WEIGHTS.legendary}).
              </p>
            </CollapsibleContent>
          </Collapsible>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {mode === "create" ? (
                <Plus data-icon="inline-start" />
              ) : (
                <Save data-icon="inline-start" />
              )}
              {mode === "create" ? "Add prize" : "Save prize"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
