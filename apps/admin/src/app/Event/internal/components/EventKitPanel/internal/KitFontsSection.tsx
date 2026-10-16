import type { FC } from "react";

import {
  BUNDLED_FONT_IDS,
  BUNDLED_FONTS,
  FONT_ROLE_LABELS,
  FONT_ROLES,
  type BundledFontId,
  type KitFontOverrides,
} from "@dither-booth/shared/kit-fonts";
import { KIT_MANIFESTS, type KitId } from "@dither-booth/shared/kits";
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
import clsx from "clsx";
import { CaseSensitive, Undo2 } from "lucide-react";

const FONT_OPTIONS = BUNDLED_FONT_IDS.map((id) => ({
  value: id,
  label: BUNDLED_FONTS[id].label,
}));

interface KitFontsSectionProps {
  kitId: KitId;
  value: KitFontOverrides | undefined;
  onChange: (value: KitFontOverrides) => void;
}

/**
 * The font of each role on the booth screen and the tickets. Every choice
 * ships with the booth, so it works offline on event day.
 */
export const KitFontsSection: FC<KitFontsSectionProps> = (props) => {
  const { kitId, value, onChange } = props;
  const kitFonts = KIT_MANIFESTS[kitId].fonts;

  return (
    <Card>
      <CardHeader>
        <CardTitle className={clsx("flex items-center gap-2.5")}>
          <IconBubble tone="rose">
            <CaseSensitive />
          </IconBubble>
          Typography
        </CardTitle>
        <CardDescription>
          The fonts on the booth screen and the tickets. They all ship with the
          booth, so they work without Wi-Fi.
        </CardDescription>
      </CardHeader>
      <CardContent className={clsx("flex flex-col gap-5")}>
        {FONT_ROLES.map((role) => {
          const id = `kit-font-${role}`;
          const current = value?.[role] ?? kitFonts[role];
          const isChanged = current !== kitFonts[role];
          return (
            <Field key={role} orientation="vertical">
              <FieldContent>
                <FieldLabel htmlFor={id}>
                  {FONT_ROLE_LABELS[role].label}
                </FieldLabel>
                <FieldDescription>
                  {FONT_ROLE_LABELS[role].help}
                </FieldDescription>
              </FieldContent>
              <div className={clsx("flex items-center gap-2")}>
                {/* ds-allow-native-select */}
                <Select
                  id={id}
                  items={FONT_OPTIONS}
                  value={current}
                  onValueChange={(next) => {
                    if (next)
                      onChange({ ...value, [role]: next as BundledFontId });
                  }}
                >
                  <SelectTrigger id={id} className={clsx("w-full sm:w-72")}>
                    <SelectValue placeholder="Choose a font" />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                        {option.value === kitFonts[role] ? " (kit's)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={clsx(!isChanged && "invisible")}
                  disabled={!isChanged}
                  aria-label={`Reset ${FONT_ROLE_LABELS[role].label} to the kit's font`}
                  title="Use the kit's font"
                  onClick={() => onChange({ ...value, [role]: kitFonts[role] })}
                >
                  <Undo2 />
                </Button>
              </div>
            </Field>
          );
        })}
      </CardContent>
    </Card>
  );
};
