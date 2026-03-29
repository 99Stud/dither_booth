import { Button } from "#components/ui/button.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "#components/ui/card.tsx";
import { Label } from "#components/ui/label.tsx";
import {
  PRINT_DEBUG_DEFAULTS,
  arePrintDebugParamsEqual,
  type DitherModeKey,
  type PrintDebugParams,
} from "#lib/print-config.ts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select.tsx";
import { Slider } from "#components/ui/slider.tsx";
import { X } from "lucide-react";
import { type FC, useCallback } from "react";

const DITHER_MODES = [
  { value: "none", label: "None" },
  { value: "burkes", label: "Burkes" },
  { value: "ordered", label: "Ordered" },
  { value: "floyd-steinberg", label: "Floyd-Steinberg" },
  { value: "atkinson", label: "Atkinson" },
  { value: "stucki", label: "Stucki" },
  { value: "sierra", label: "Sierra" },
  { value: "sierra-lite", label: "Sierra Lite" },
  { value: "jarvis-judice-ninke", label: "Jarvis-Judice-Ninke" },
];

const SliderControl: FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}> = (props) => {
  const { label, value, min, max, step, onChange } = props;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {value.toFixed(step < 1 ? 2 : 0)}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => {
          onChange(Array.isArray(v) ? v[0]! : v);
        }}
      />
    </div>
  );
};

export const PrintDebugPanel: FC<{
  onClose: () => void;
  params: PrintDebugParams;
  onParamsChange: (params: PrintDebugParams) => void;
  previewSrc: string | null;
  previewLoading: boolean;
  hasSavedConfig: boolean;
  isDirty: boolean;
  onResetToApplied: () => void;
  onResetToDefaults: () => void;
  onSaveConfig: () => void;
  onPrintWithParams: () => void;
}> = (props) => {
  const {
    onClose,
    params,
    onParamsChange,
    previewSrc,
    previewLoading,
    hasSavedConfig,
    isDirty,
    onResetToApplied,
    onResetToDefaults,
    onSaveConfig,
    onPrintWithParams,
  } = props;

  const update = useCallback(
    (patch: Partial<PrintDebugParams>) => {
      const nextParams = { ...params, ...patch };
      onParamsChange(nextParams);
    },
    [params, onParamsChange],
  );
  const isAtDefaults = arePrintDebugParamsEqual(params, PRINT_DEBUG_DEFAULTS);

  return (
    <Card className="w-72 max-h-[calc(100dvh-4rem)] overflow-y-auto bg-card/95 backdrop-blur-sm">
      <CardHeader className="border-b">
        <CardTitle>Print Config</CardTitle>
        <CardAction>
          <Button variant="ghost" size="icon-xs" onClick={onClose}>
            <X className="size-3.5" />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Preview</Label>
          <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-white">
            {previewSrc ? (
              <img
                src={previewSrc}
                alt="Dither preview"
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-xs text-muted-foreground">
                {previewLoading ? "Generating..." : "No preview"}
              </span>
            )}
            {previewLoading && previewSrc && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <span className="text-xs text-white">Updating...</span>
              </div>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            Preview updates automatically while you adjust the settings.
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Dither Mode</Label>
          <Select
            value={params.ditherMode}
            onValueChange={(v) => {
              if (v) update({ ditherMode: v as DitherModeKey });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DITHER_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <SliderControl
          label="Brightness"
          value={params.brightness}
          min={0}
          max={3}
          step={0.05}
          onChange={(v) => update({ brightness: v })}
        />
        <SliderControl
          label="Contrast"
          value={params.contrast}
          min={0}
          max={3}
          step={0.05}
          onChange={(v) => update({ contrast: v })}
        />
        <SliderControl
          label="Gamma"
          value={params.gamma}
          min={0.1}
          max={5}
          step={0.05}
          onChange={(v) => update({ gamma: v })}
        />
        <SliderControl
          label="Threshold"
          value={params.threshold}
          min={0}
          max={255}
          step={1}
          onChange={(v) => update({ threshold: v })}
        />

        <div className="rounded-md border p-3 text-xs text-muted-foreground">
          {isDirty
            ? "Unsaved changes. Regular printing still uses the last saved configuration."
            : hasSavedConfig
              ? "Saved configuration is active for regular printing."
              : "No saved configuration yet. Regular printing uses the default values."}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onResetToApplied}
          >
            {hasSavedConfig ? "Revert" : "Reset"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onResetToDefaults}
            disabled={isAtDefaults}
          >
            Defaults
          </Button>
          <Button
            size="sm"
            className="col-span-2"
            onClick={onSaveConfig}
            disabled={!isDirty}
          >
            Save
          </Button>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onClose}
          >
            Close
          </Button>
          <Button size="sm" className="flex-1" onClick={onPrintWithParams}>
            Print
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
