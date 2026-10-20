import type { KitCopyOverrides } from "@dither-booth/shared/kit-copy";
import type { KitFontOverrides } from "@dither-booth/shared/kit-fonts";
import type {
  CameraScreen,
  KitId,
  KitSettings,
} from "@dither-booth/shared/kits";
import type { FC } from "react";

import {
  applyBackgroundControls,
  BACKGROUND_CONTROLS,
  defaultControlValue,
  type BackgroundControl,
  type BackgroundControlValues,
  type BackgroundSettings,
} from "@dither-booth/shared/background-controls";
import {
  COPY_FIELDS,
  COPY_GROUPS,
  COPY_KEYS,
  type CopyGroup,
  type CopyKey,
} from "@dither-booth/shared/kit-copy";
import {
  getBackgroundBase,
  getBackgroundHighlight,
  KIT_MANIFESTS,
} from "@dither-booth/shared/kits";
import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@dither-booth/ui/components/ui/alert-dialog";
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
import clsx from "clsx";
import {
  Construction,
  MessageSquareText,
  MonitorSmartphone,
  Palette,
  ReceiptText,
  RotateCcw,
  Save,
  Ticket,
  Undo2,
} from "lucide-react";
import { useState } from "react";

import type { CurrentEvent } from "../../Event.types";

import { KIT_FIELD_OPTIONS } from "../../Event.constants";
import { KitBackgroundSection } from "./internal/KitBackgroundSection";
import { KitCameraSection } from "./internal/KitCameraSection";
import { KitCopyField } from "./internal/KitCopyField";
import { KitFontsSection } from "./internal/KitFontsSection";
import { KitPreviewPane } from "./internal/KitPreviewPane";

/** What the tab edits, in the shape it is saved in. */
type KitDraft = {
  kitId: KitId;
  copy: KitCopyOverrides;
  fonts?: KitFontOverrides;
  background?: BackgroundSettings;
  camera?: Partial<CameraScreen>;
};

const toDraft = (event: CurrentEvent): KitDraft => ({
  kitId: event.campaign.kitId,
  copy: event.campaign.kitSettings.copy ?? {},
  fonts: event.campaign.kitSettings.fonts,
  background: event.campaign.kitSettings.background,
  camera: event.campaign.kitSettings.camera,
});

/** Only the shader controls that moved away from the look they start from. */
const changedBackground = (draft: KitDraft): BackgroundSettings | undefined => {
  const kitBackgroundId = KIT_MANIFESTS[draft.kitId].background.effect;
  const id = draft.background?.id ?? kitBackgroundId;
  const base = getBackgroundBase(draft.kitId, id);
  const controls: Record<string, BackgroundControl> =
    BACKGROUND_CONTROLS[id].controls;
  const values: BackgroundControlValues = {};
  for (const [key, value] of Object.entries(draft.background?.values ?? {})) {
    const control = controls[key];
    if (
      control &&
      JSON.stringify(value) !==
        JSON.stringify(defaultControlValue(control, base))
    ) {
      values[key] = value;
    }
  }
  const hasValues = Object.keys(values).length > 0;
  if (id === kitBackgroundId && !hasValues) return undefined;
  return {
    id,
    ...(hasValues && draft.background?.look
      ? { look: draft.background.look }
      : {}),
    ...(hasValues ? { values } : {}),
  };
};

/**
 * Only what differs from the kit is saved, so the kit's own wording and look
 * keep reaching everything the event didn't change.
 */
const toSettings = (draft: KitDraft): KitSettings => {
  const manifest = KIT_MANIFESTS[draft.kitId];
  const copy: KitCopyOverrides = {};
  for (const key of COPY_KEYS) {
    const value = draft.copy[key]?.trim();
    if (value !== undefined && value !== manifest.copy[key]) copy[key] = value;
  }
  const fonts: KitFontOverrides = {};
  for (const [role, font] of Object.entries(draft.fonts ?? {})) {
    const key = role as keyof KitFontOverrides;
    if (font !== manifest.fonts[key]) fonts[key] = font;
  }
  const camera: Partial<CameraScreen> = {};
  for (const [key, value] of Object.entries(draft.camera ?? {})) {
    const cameraKey = key as keyof CameraScreen;
    if (value !== manifest.camera[cameraKey]) {
      Object.assign(camera, { [cameraKey]: value });
    }
  }
  const background = changedBackground(draft);

  return {
    ...(Object.keys(copy).length > 0 ? { copy } : {}),
    ...(Object.keys(fonts).length > 0 ? { fonts } : {}),
    ...(background ? { background } : {}),
    ...(Object.keys(camera).length > 0 ? { camera } : {}),
  };
};

const sameSettings = (a: KitDraft, b: KitDraft) =>
  a.kitId === b.kitId &&
  JSON.stringify(toSettings(a)) === JSON.stringify(toSettings(b));

const isMissingText = (draft: KitDraft, key: CopyKey) => {
  const field = COPY_FIELDS[key];
  return !("optional" in field) && draft.copy[key]?.trim() === "";
};

const CHANGED_PART_LABELS = {
  copy: "text",
  fonts: "fonts",
  background: "shader",
  camera: "camera screen",
} satisfies Record<keyof KitSettings, string>;

const GROUP_ICONS = {
  landing: MonitorSmartphone,
  prompts: MessageSquareText,
  maintenance: Construction,
  photoTicket: ReceiptText,
  lotteryTicket: Ticket,
} satisfies Record<CopyGroup, FC>;

const COPY_KEYS_BY_GROUP = Object.keys(COPY_GROUPS).map((group) => ({
  group: group as CopyGroup,
  keys: COPY_KEYS.filter((key) => COPY_FIELDS[key].group === group),
}));

interface EventKitPanelProps {
  event: CurrentEvent;
  isSaving: boolean;
  onSave: (input: { kitId: KitId; settings: KitSettings }) => Promise<void>;
}

/**
 * The event's kit and its text. Every field shows the text exactly as the
 * booth will show it: the kit's own until it is changed here. Nothing reaches
 * the booth until Save.
 */
export const EventKitPanel: FC<EventKitPanelProps> = (props) => {
  const { event, isSaving, onSave } = props;
  const saved = toDraft(event);
  const [draft, setDraft] = useState<KitDraft>(saved);
  const [isResetOpen, setIsResetOpen] = useState(false);

  const defaults = KIT_MANIFESTS[draft.kitId].copy;
  const isDirty = !sameSettings(draft, saved);
  const missingKeys = COPY_KEYS.filter((key) => isMissingText(draft, key));
  const changedParts = Object.keys(toSettings(draft)).map(
    (part) => CHANGED_PART_LABELS[part as keyof KitSettings],
  );
  const shaderPreview = applyBackgroundControls(
    getBackgroundBase(
      draft.kitId,
      draft.background?.id ?? KIT_MANIFESTS[draft.kitId].background.effect,
    ),
    draft.background?.values ?? {},
  );

  const setCopy = (key: CopyKey, value: string | undefined) => {
    setDraft((current) => {
      const copy = { ...current.copy };
      if (value === undefined) delete copy[key];
      else copy[key] = value;
      return { ...current, copy };
    });
  };

  const save = async () => {
    if (missingKeys.length > 0) return;
    await onSave({ kitId: draft.kitId, settings: toSettings(draft) });
  };

  return (
    <div
      className={clsx(
        "grid items-start gap-4 pb-32 md:gap-6 md:pb-24",
        "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]",
      )}
    >
      {/* The preview leads: on top on narrow screens, beside the editor
          (and kept in view) on wide ones. */}
      <div className={clsx("xl:sticky xl:top-20 xl:order-last")}>
        <KitPreviewPane kitId={draft.kitId} settings={toSettings(draft)} />
      </div>

      <div className={clsx("flex min-w-0 flex-col gap-4 md:gap-6")}>
        <Card>
          <CardHeader>
            <CardTitle className={clsx("flex items-center gap-2.5")}>
              <IconBubble tone="violet">
                <Palette />
              </IconBubble>
              Kit
            </CardTitle>
            <CardDescription>
              The kit sets how the booth screen and the tickets look. The fonts,
              the shader, the camera screen and the text below start from the
              kit&apos;s own; in the text, wrap words in ** to make them bold.
            </CardDescription>
          </CardHeader>
          <CardContent className={clsx("flex flex-col gap-4")}>
            <Field orientation="vertical">
              <FieldLabel htmlFor="kit-id">Kit</FieldLabel>
              {/* Base UI's Select is a button and listbox popup, not a native
                <select>; the design lint matches the component name. */}
              {/* ds-allow-native-select */}
              <Select
                id="kit-id"
                items={KIT_FIELD_OPTIONS}
                value={draft.kitId}
                onValueChange={(value) => {
                  if (value) {
                    // Fonts, shader and camera start from a kit's look, so a
                    // new kit starts them over; the text edits carry across.
                    setDraft((current) => ({
                      kitId: value as KitId,
                      copy: current.copy,
                    }));
                  }
                }}
              >
                <SelectTrigger id="kit-id" className={clsx("w-full sm:w-72")}>
                  <SelectValue placeholder="Choose a kit" />
                </SelectTrigger>
                <SelectContent>
                  {KIT_FIELD_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div
              className={clsx(
                "flex flex-wrap items-center justify-between gap-3",
                "text-sm text-muted-foreground",
              )}
            >
              <p>
                {changedParts.length === 0
                  ? "Everything is the kit's own."
                  : `Differs from the kit: ${changedParts.join(", ")}.`}
              </p>
              <Button
                type="button"
                variant="destructive"
                disabled={changedParts.length === 0}
                onClick={() => setIsResetOpen(true)}
              >
                <RotateCcw data-icon="inline-start" />
                Reset to kit defaults
              </Button>
            </div>
          </CardContent>
        </Card>

        <KitFontsSection
          kitId={draft.kitId}
          value={draft.fonts}
          onChange={(fonts) => setDraft((current) => ({ ...current, fonts }))}
        />
        <KitBackgroundSection
          kitId={draft.kitId}
          value={draft.background}
          onChange={(background) =>
            setDraft((current) => ({ ...current, background }))
          }
        />
        <KitCameraSection
          kitId={draft.kitId}
          value={draft.camera}
          backgroundHighlight={getBackgroundHighlight(shaderPreview)}
          onChange={(camera) => setDraft((current) => ({ ...current, camera }))}
        />

        {COPY_KEYS_BY_GROUP.map(({ group, keys }) => {
          const GroupIcon = GROUP_ICONS[group];
          return (
            <Card key={group}>
              <CardHeader>
                <CardTitle className={clsx("flex items-center gap-2.5")}>
                  <IconBubble tone="sky">
                    <GroupIcon />
                  </IconBubble>
                  {COPY_GROUPS[group]}
                </CardTitle>
              </CardHeader>
              <CardContent className={clsx("flex flex-col gap-5")}>
                {keys.map((key) => (
                  <KitCopyField
                    key={key}
                    copyKey={key}
                    defaultText={defaults[key]}
                    value={draft.copy[key]}
                    onChange={(value) => setCopy(key, value)}
                  />
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {isDirty ? (
        <div
          role="region"
          aria-label="Unsaved kit changes"
          className={clsx(
            // Phones: a card floating above the tab bar (AppTabBar). Wider
            // screens: docked to the bottom, right of the sidebar.
            "fixed z-40 border-border bg-background/95 backdrop-blur",
            "max-md:inset-x-4 max-md:bottom-[calc(5.5rem+env(safe-area-inset-bottom))]",
            "max-md:rounded-2xl max-md:border max-md:shadow-lg",
            "md:inset-x-0 md:bottom-0 md:left-(--sidebar-width) md:border-t",
            "px-4 py-3 md:px-6",
          )}
        >
          <div
            className={clsx(
              "mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3",
            )}
          >
            <FieldContent className={clsx("min-w-0")}>
              <p className={clsx("text-sm font-medium")}>Unsaved changes</p>
              <FieldDescription
                aria-live="polite"
                // Phones keep only the warning; the reminder needs the room.
                className={clsx(missingKeys.length === 0 && "max-sm:hidden")}
              >
                {missingKeys.length > 0
                  ? `${missingKeys.length} required ${missingKeys.length === 1 ? "line is" : "lines are"} empty.`
                  : "The booth screen updates as soon as you save."}
              </FieldDescription>
            </FieldContent>
            <div className={clsx("flex gap-2")}>
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => setDraft(saved)}
              >
                <Undo2 data-icon="inline-start" />
                Discard
              </Button>
              <Button
                type="button"
                disabled={isSaving || missingKeys.length > 0}
                onClick={() => void save()}
              >
                <Save data-icon="inline-start" />
                {isSaving ? "Saving" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <AlertDialog open={isResetOpen} onOpenChange={setIsResetOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to kit defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              The text, fonts, shader and camera screen all go back to{" "}
              {KIT_MANIFESTS[draft.kitId].label}&apos;s own. Nothing changes on
              the booth until you save.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setDraft((current) => ({ kitId: current.kitId, copy: {} }));
                setIsResetOpen(false);
              }}
            >
              Reset everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
