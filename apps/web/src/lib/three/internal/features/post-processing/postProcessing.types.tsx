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

export interface PostProcessingEffect {
  key: PostProcessingEffectKey;
  enabled: boolean;
  prepare?: () => Promise<void>;
  build: (inputNode: PostProcessingEffectNode) => PostProcessingEffectNode;
  dispose?: () => void;
}
