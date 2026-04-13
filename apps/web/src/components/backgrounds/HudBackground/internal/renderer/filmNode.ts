import { film } from "three/addons/tsl/display/FilmNode.js";
import type Node from "three/src/nodes/core/Node.js";
import { uniform } from "three/tsl";
import { FILM } from "../hudBackground.config.ts";

const uFilmStrength = uniform(FILM.strength);

export function filmNode(inputNode: Node, uvNode: Node) {
  return film(inputNode, uFilmStrength, uvNode);
}
