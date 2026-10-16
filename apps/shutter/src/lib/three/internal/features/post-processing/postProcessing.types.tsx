import type { ParametersGroup } from "three/addons/inspector/tabs/Parameters.js";
import type { Node } from "three/webgpu";

export type PostProcessingEffectNode = Node<"vec4">;

export type PostProcessingEffectKey =
  | "ascii"
  | "bloom"
  | "crt"
  | "film"
  | "scanlines";

export interface PostProcessingPassOptions {
  enabled?: boolean;
}

export type PostProcessingPassConfig = Record<
  PostProcessingEffectKey,
  Required<PostProcessingPassOptions>
>;

export interface PostProcessingOptions {
  passes?: Partial<Record<PostProcessingEffectKey, PostProcessingPassOptions>>;
}

export interface AsciiSettings {
  cellSize: number;
  invert: number;
  color: number;
  charBrightness: number;
  backgroundBrightness: number;
  smoothness: number;
}

export interface BloomSettings {
  strength: number;
  radius: number;
  threshold: number;
}

export interface FilmSettings {
  strength: number;
}

export interface ScanlinesSettings {
  thickness: number;
  intensity: number;
  speed: number;
  focus: number;
}

/** Tunable values for each post pass; a background preset carries one of these. */
export interface PostProcessingSettings {
  ascii: AsciiSettings;
  bloom: BloomSettings;
  film: FilmSettings;
  scanlines: ScanlinesSettings;
}

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
