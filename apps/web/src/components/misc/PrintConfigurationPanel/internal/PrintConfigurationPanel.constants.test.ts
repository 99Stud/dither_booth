import { describe, expect, it } from "bun:test";

import {
  DEFAULT_PRINT_CONFIGURATION_FORM_VALUES,
  getPrintConfigurationFormValues,
} from "./PrintConfigurationPanel.constants";

describe("getPrintConfigurationFormValues", () => {
  it("returns the default values when no configuration exists", () => {
    expect(getPrintConfigurationFormValues(null)).toEqual(
      DEFAULT_PRINT_CONFIGURATION_FORM_VALUES,
    );
  });

  it("normalizes persisted configuration rows for the form", () => {
    expect(
      getPrintConfigurationFormValues({
        ditherModeCode: 3,
        brightness: 1.25,
        contrast: 0.75,
        gamma: 1.5,
        threshold: 160,
      }),
    ).toEqual({
      ditherModeCode: 3,
      brightness: 1.25,
      contrast: 0.75,
      gamma: 1.5,
      threshold: 160,
    });
  });

  it("keeps the persisted dither mode code unchanged", () => {
    expect(
      getPrintConfigurationFormValues({
        ditherModeCode: 0,
        brightness: 1,
        contrast: 1,
        gamma: 1,
        threshold: 128,
      }).ditherModeCode,
    ).toBe(0);
  });
});
