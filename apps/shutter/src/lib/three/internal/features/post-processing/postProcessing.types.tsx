import type {
  PostPassKey,
  PostProcessingSettings,
} from "@dither-booth/shared/backgrounds";
import type { ParametersGroup } from "three/addons/inspector/tabs/Parameters.js";
import type { Node } from "three/webgpu";

export type PostProcessingEffectNode = Node<"vec4">;

export type {
  AsciiSettings,
  BloomSettings,
  FilmSettings,
  PostPasses,
  PostProcessingSettings,
  ScanlinesSettings,
} from "@dither-booth/shared/backgrounds";

export type PostProcessingEffectKey = PostPassKey;

export interface PostProcessingEffect {
  key: PostProcessingEffectKey;
  enabled: boolean;
  prepare?: () => Promise<void>;
  build: (inputNode: PostProcessingEffectNode) => PostProcessingEffectNode;
  /** Writes the effect's values from settings into its live uniforms. */
  applySettings?: (settings: PostProcessingSettings) => void;
  attachDebug?: (folder: ParametersGroup) => void;
  dispose?: () => void;
}
