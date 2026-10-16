import type { ParametersGroup } from "three/addons/inspector/tabs/Parameters.js";

import { film } from "three/addons/tsl/display/FilmNode.js";
import { convertToTexture, screenUV, uniform } from "three/tsl";

import type {
  FilmSettings,
  PostProcessingEffect,
  PostProcessingSettings,
} from "../postProcessing.types";

export function createFilmEffect(
  enabled: boolean,
  settings: FilmSettings,
): PostProcessingEffect {
  const uFilmStrength = uniform(settings.strength);

  return {
    key: "film",
    enabled,
    build: (inputNode) =>
      convertToTexture(film(inputNode, uFilmStrength, screenUV)),
    applySettings(next: PostProcessingSettings) {
      uFilmStrength.value = next.film.strength;
    },
    attachDebug(folder: ParametersGroup) {
      const filmFolder = folder.addFolder("Film Node");
      filmFolder.add(uFilmStrength, "value", 0, 1, 0.01).name("Strength");
    },
  };
}
