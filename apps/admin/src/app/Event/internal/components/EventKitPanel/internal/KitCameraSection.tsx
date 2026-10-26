import type { FC } from "react";

import { SLIDER_DEFAULT } from "@dither-booth/shared/background-controls";
import {
  KIT_MANIFESTS,
  type CameraScreen,
  type KitId,
} from "@dither-booth/shared/kits";
import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
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
import { Switch } from "@dither-booth/ui/components/ui/switch";
import clsx from "clsx";
import { Check, Monitor } from "lucide-react";

import { ColorWell } from "./KitColorsControl";
import { KitWordSlider } from "./KitWordSlider";

interface KitCameraSectionProps {
  kitId: KitId;
  value: Partial<CameraScreen> | undefined;
  /** The background's brightest tone, which "Match the background" uses. */
  backgroundHighlight: string;
  onChange: (value: Partial<CameraScreen>) => void;
}

/** The CRT over the camera square while a guest poses. */
export const KitCameraSection: FC<KitCameraSectionProps> = (props) => {
  const { kitId, value, backgroundHighlight, onChange } = props;
  const camera = { ...KIT_MANIFESTS[kitId].camera, ...value };
  const isOff = !camera.crtLines && !camera.wash;
  const matchesShader = camera.tint === "background";
  const set = (next: Partial<CameraScreen>) => onChange({ ...value, ...next });

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone="sky">
            <Monitor />
          </IconBubble>
          Camera screen
        </CardTitle>
        <CardDescription>
          The old-monitor effect over the live camera and the frozen photo. The
          printed photo never has it.
        </CardDescription>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-5")}>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="kit-camera-lines">CRT lines</FieldLabel>
            <FieldDescription>Scanlines and a slow sweep.</FieldDescription>
          </FieldContent>
          <Switch
            id="kit-camera-lines"
            checked={camera.crtLines}
            onCheckedChange={(checked) => set({ crtLines: checked })}
          />
        </Field>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="kit-camera-wash">Colour wash</FieldLabel>
            <FieldDescription>A light tint over the picture.</FieldDescription>
          </FieldContent>
          <Switch
            id="kit-camera-wash"
            checked={camera.wash}
            onCheckedChange={(checked) => set({ wash: checked })}
          />
        </Field>

        <fieldset
          disabled={isOff}
          className={clsx(
            "flex flex-col gap-5 disabled:opacity-50",
            "border-0 p-0",
          )}
        >
          <div className={clsx("flex flex-col gap-2")}>
            <span id="kit-camera-tint" className={clsx("text-sm font-medium")}>
              Tint
            </span>
            <div
              role="radiogroup"
              aria-labelledby="kit-camera-tint"
              className={clsx("flex flex-wrap gap-2")}
            >
              {[
                {
                  id: "background",
                  label: "Match the background",
                  selected: matchesShader,
                },
                { id: "custom", label: "Custom", selected: !matchesShader },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={option.selected}
                  onClick={() =>
                    set({
                      tint:
                        option.id === "background"
                          ? "background"
                          : matchesShader
                            ? backgroundHighlight
                            : camera.tint,
                    })
                  }
                  className={clsx(
                    "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm",
                    "transition-colors hover:bg-muted disabled:pointer-events-none",
                    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    option.selected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background",
                  )}
                >
                  {option.id === "background" ? (
                    <span
                      aria-hidden
                      className={clsx(
                        "size-4 rounded-full border border-border",
                      )}
                      style={{ backgroundColor: backgroundHighlight }}
                    />
                  ) : null}
                  {option.label}
                  {option.selected ? (
                    <Check aria-hidden className={clsx("size-3.5")} />
                  ) : null}
                </button>
              ))}
            </div>
            {matchesShader ? null : (
              <div className={clsx("max-w-56")}>
                <ColorWell
                  id="kit-camera-tint-color"
                  label="Tint colour"
                  value={camera.tint}
                  onChange={(color) => set({ tint: color })}
                />
              </div>
            )}
          </div>
          <KitWordSlider
            id="kit-camera-strength"
            label="Strength"
            help="How visible the lines and the wash are."
            ends={["Subtle", "Strong"]}
            value={camera.strength ?? SLIDER_DEFAULT}
            onChange={(strength) => set({ strength })}
          />
        </fieldset>
      </CardContent>
    </Card>
  );
};
