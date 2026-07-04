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
  };
}
