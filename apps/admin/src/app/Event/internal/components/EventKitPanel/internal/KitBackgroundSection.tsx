import type { FC } from "react";

import {
  applyBackgroundControls,
  BACKGROUND_CONTROLS,
  defaultControlValue,
  type BackgroundControl,
  type BackgroundSettings,
  type ControlValue,
} from "@dither-booth/shared/background-controls";
import {
  BACKGROUND_IDS,
  BACKGROUND_LABELS,
  type BackgroundId,
} from "@dither-booth/shared/backgrounds";
import {
  getBackgroundBase,
  KIT_MANIFESTS,
  type KitId,
} from "@dither-booth/shared/kits";
import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { Button } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@dither-booth/ui/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dither-booth/ui/components/ui/select";
import { Switch } from "@dither-booth/ui/components/ui/switch";
import clsx from "clsx";
import { Check, RotateCcw, Sparkles } from "lucide-react";

import { KitColorsControl } from "./KitColorsControl";
import { KitWordSlider } from "./KitWordSlider";

interface KitBackgroundSectionProps {
  kitId: KitId;
  value: BackgroundSettings | undefined;
  onChange: (value: BackgroundSettings | undefined) => void;
}

/**
 * The booth screen's shader in plain words: the shader, a look to start
 * from, then a few worded controls. Every slider's middle is the kit's own
 * look; raw shader values never show here.
 */
export const KitBackgroundSection: FC<KitBackgroundSectionProps> = (props) => {
  const { kitId, value, onChange } = props;
  const kitBackgroundId = KIT_MANIFESTS[kitId].background.effect;
  const backgroundId = value?.id ?? kitBackgroundId;
  const base = getBackgroundBase(kitId, backgroundId);
  const { groups, looks } = BACKGROUND_CONTROLS[backgroundId];
  const controls: Record<string, BackgroundControl> =
    BACKGROUND_CONTROLS[backgroundId].controls;
  const values = value?.values ?? {};
  const rendered = JSON.stringify(applyBackgroundControls(base, values));

  const valueOf = (key: string, control: BackgroundControl): ControlValue =>
    values[key] ?? defaultControlValue(control, base);

  const setValue = (key: string, next: ControlValue) =>
    onChange({
      ...value,
      id: backgroundId,
      values: { ...values, [key]: next },
    });

  const activeLook = looks.find((look) => look.id === value?.look) ?? looks[0];
  const isEdited =
    activeLook !== undefined &&
    JSON.stringify(applyBackgroundControls(base, activeLook.values)) !==
      rendered;
  const colorsKey = Object.keys(controls).find(
    (key) => controls[key]?.kind === "colors",
  );
  const lookColors = (lookValues: Record<string, ControlValue>) => {
    const control = colorsKey ? controls[colorsKey] : undefined;
    return control?.kind === "colors"
      ? control.read(applyBackgroundControls(base, lookValues))
      : [];
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone="amber">
            <Sparkles />
          </IconBubble>
          Shader
        </CardTitle>
        <CardDescription>
          The moving background on the booth screen. Each slider starts in the
          middle, which is the kit&apos;s own look.
        </CardDescription>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-6")}>
        <div className={clsx("flex flex-wrap items-end justify-between gap-3")}>
          <Field orientation="vertical" className={clsx("w-full sm:w-72")}>
            <FieldLabel htmlFor="kit-shader">Shader</FieldLabel>
            {/* ds-allow-native-select */}
            <Select
              id="kit-shader"
              items={BACKGROUND_IDS.map((id) => ({
                value: id,
                label: BACKGROUND_LABELS[id],
              }))}
              value={backgroundId}
              onValueChange={(next) => {
                if (!next) return;
                const id = next as BackgroundId;
                onChange(id === kitBackgroundId ? undefined : { id });
              }}
            >
              <SelectTrigger id="kit-shader" className={clsx("w-full")}>
                <SelectValue placeholder="Choose a shader" />
              </SelectTrigger>
              <SelectContent>
                {BACKGROUND_IDS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {BACKGROUND_LABELS[id]}
                    {id === kitBackgroundId ? " (kit's)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button
            type="button"
            variant="outline"
            disabled={Object.keys(values).length === 0}
            onClick={() =>
              onChange(
                backgroundId === kitBackgroundId
                  ? undefined
                  : { id: backgroundId },
              )
            }
          >
            <RotateCcw data-icon="inline-start" />
            Back to the kit&apos;s look
          </Button>
        </div>

        <div className={clsx("flex flex-col gap-2")}>
          <span id="kit-look-label" className={clsx("text-sm font-medium")}>
            Look
            {isEdited ? (
              <span className={clsx("font-normal text-muted-foreground")}>
                {" "}
                · {activeLook?.label}, edited
              </span>
            ) : null}
          </span>
          <FieldDescription>
            A starting point. Picking one sets the controls below.
          </FieldDescription>
          <div
            role="radiogroup"
            aria-labelledby="kit-look-label"
            className={clsx("grid grid-cols-2 gap-2 sm:grid-cols-3")}
          >
            {looks.map((look) => {
              const isSelected = look.id === activeLook?.id && !isEdited;
              return (
                <button
                  key={look.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() =>
                    onChange({
                      id: backgroundId,
                      look: look.id,
                      values: { ...look.values },
                    })
                  }
                  className={clsx(
                    "flex flex-col gap-2 rounded-xl border p-3 text-left text-sm",
                    "transition-colors hover:bg-muted",
                    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background",
                  )}
                >
                  <span
                    aria-hidden
                    className={clsx("flex h-8 overflow-hidden rounded-md")}
                  >
                    {lookColors(look.values).map((color, index) => (
                      <span
                        // oxlint-disable-next-line react/no-array-index-key -- colours repeat
                        key={index}
                        className={clsx("flex-1")}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </span>
                  <span
                    className={clsx(
                      "flex items-center justify-between font-medium",
                    )}
                  >
                    {look.label}
                    {isSelected ? (
                      <Check aria-hidden className={clsx("size-4")} />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {groups.map((group) => (
          <section
            key={group.label}
            aria-label={group.label}
            className={clsx("flex flex-col gap-4")}
          >
            <h3
              className={clsx(
                "text-xs font-medium tracking-wide text-muted-foreground uppercase",
              )}
            >
              {group.label}
            </h3>
            {group.keys.map((key) => {
              const control = controls[key];
              if (!control) return null;
              const id = `kit-shader-${key}`;
              const current = valueOf(key, control);

              if (control.kind === "slider") {
                return (
                  <KitWordSlider
                    key={key}
                    id={id}
                    label={control.label}
                    help={control.help}
                    ends={control.ends}
                    value={typeof current === "number" ? current : 50}
                    onChange={(next) => setValue(key, next)}
                  />
                );
              }

              if (control.kind === "colors") {
                return (
                  <KitColorsControl
                    key={key}
                    id={id}
                    control={control}
                    kitColors={control.read(base)}
                    value={
                      Array.isArray(current) ? current : control.read(base)
                    }
                    onChange={(next) => setValue(key, next)}
                  />
                );
              }

              return (
                <Field key={key} orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor={id}>{control.label}</FieldLabel>
                    <FieldDescription>{control.help}</FieldDescription>
                  </FieldContent>
                  <Switch
                    id={id}
                    checked={current === true}
                    onCheckedChange={(checked) => setValue(key, checked)}
                  />
                </Field>
              );
            })}
          </section>
        ))}
      </CardContent>
    </Card>
  );
};
