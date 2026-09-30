import type { Material } from "three";

export function disposeMaterial(
  material: Material | Material[] | null | undefined,
): void {
  if (Array.isArray(material)) {
    for (const item of material) item.dispose();
    return;
  }

  material?.dispose();
}
