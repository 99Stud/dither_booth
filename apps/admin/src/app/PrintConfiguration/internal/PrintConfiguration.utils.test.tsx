import { describe, expect, it } from "bun:test";

import type { PrintConfigurationFormValues } from "./PrintConfiguration.types";

import {
  DEFAULT_PRINT_CONFIGURATION_FORM_VALUES,
  getPrintConfigurationFormValues,
} from "./PrintConfiguration.constants";
import {
  getChangedPreviewTabs,
  getInitialPreviewTriggerState,
  getPrintConfigurationImageDataUrl,
  isPrintConfigurationTab,
} from "./PrintConfiguration.utils";

const formValues: PrintConfigurationFormValues = {
  ...DEFAULT_PRINT_CONFIGURATION_FORM_VALUES,
};

describe("PrintConfiguration utils", () => {
  it("creates the initial preview trigger state", () => {
    expect(getInitialPreviewTriggerState()).toEqual({
      dithering: false,
      receipt: false,
    });
  });

  it("detects valid print configuration tabs", () => {
    expect(isPrintConfigurationTab("dithering")).toBe(true);
    expect(isPrintConfigurationTab("receipt")).toBe(true);
    expect(isPrintConfigurationTab("preview")).toBe(false);
  });

  it("marks both preview tabs dirty before a persisted value exists", () => {
    expect(getChangedPreviewTabs(undefined, formValues)).toEqual([
      "dithering",
      "receipt",
    ]);
  });

  it("marks both preview tabs dirty for shared dithering fields", () => {
    expect(
      getChangedPreviewTabs(formValues, {
        ...formValues,
        exposure: 2,
      }),
    ).toEqual(["dithering", "receipt"]);
  });

  it("marks only the receipt tab dirty for receipt-only fields", () => {
    expect(
      getChangedPreviewTabs(formValues, {
        ...formValues,
        threshold: 64,
      }),
    ).toEqual(["receipt"]);
    expect(
      getChangedPreviewTabs(formValues, {
        ...formValues,
        template: "heirvey",
      }),
    ).toEqual(["receipt"]);
  });

  it("returns no dirty tabs when preview fields do not change", () => {
    expect(getChangedPreviewTabs(formValues, { ...formValues })).toEqual([]);
  });

  it("normalizes missing and persisted form values", () => {
    expect(getPrintConfigurationFormValues()).toEqual(
      DEFAULT_PRINT_CONFIGURATION_FORM_VALUES,
    );
    expect(
      getPrintConfigurationFormValues({
        colorSchemeCode: 7,
        ditherModeCode: 8,
        exposure: 1.5,
        highlights: 0.25,
        saturation: 2,
        serpentine: false,
        shadows: 0.5,
        template: "heirvey",
        threshold: 90,
      }),
    ).toEqual({
      colorSchemeCode: 7,
      ditherModeCode: 8,
      exposure: 1.5,
      highlights: 0.25,
      saturation: 2,
      serpentine: false,
      shadows: 0.5,
      template: "heirvey",
      threshold: 90,
    });
  });

  it("converts encoded images to data URLs", () => {
    expect(
      getPrintConfigurationImageDataUrl({
        data: "abc",
        mimeType: "image/png",
      }),
    ).toBe("data:image/png;base64,abc");
  });
});
