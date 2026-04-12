import { createDitherConfiguration } from "./mutations/create-dither-configuration";
import { dither } from "./mutations/dither";
import { ditherPreview } from "./mutations/dither-preview";
import { updateDitherConfiguration } from "./mutations/update-dither-configuration";
import { getDitherConfiguration } from "./queries/get-dither-configuration";

export const imageManipulation = {
  createDitherConfiguration,
  dither,
  ditherPreview,
  updateDitherConfiguration,
  getDitherConfiguration,
};
