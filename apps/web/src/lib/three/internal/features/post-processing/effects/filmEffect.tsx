import type { ParametersGroup } from "three/addons/inspector/tabs/Parameters.js";

import { film } from "three/addons/tsl/display/FilmNode.js";
import { convertToTexture, screenUV, uniform } from "three/tsl";

import type { PostProcessingEffect } from "../postProcessing.types";

export function createFilmEffect(enabled: boolean): PostProcessingEffect {
  const uFilmStrength = uniform(0.5);

  return {
    key: "film",
    enabled,
    build: (inputNode) =>
      convertToTexture(film(inputNode, uFilmStrength, screenUV)),
    attachDebug(folder: ParametersGroup) {
      const filmFolder = folder.addFolder("Film Node");
      filmFolder.add(uFilmStrength, "value", 0, 1, 0.01).name("Strength");
    },
  };
}
