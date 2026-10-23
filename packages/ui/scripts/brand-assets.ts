// Renders every app's icons, the docs' favicon and logos, and the sign-in
// email's images from the mark in src/lib/brand.tsx. iOS ignores an SVG
// Home Screen icon and mail apps block SVG images, so most are PNGs,
// committed; run again if the mark changes: bun run --filter @dither-booth/ui brand
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

import {
  BRAND_ICON_BACKGROUND,
  ditherBoothIconSvg,
  ditherBoothMarkSvg,
} from "../src/lib/brand.tsx";

const repo = resolve(import.meta.dir, "../../..");
const at = (path: string) => resolve(repo, path);

const write = async (path: string, data: Buffer | string) => {
  await mkdir(dirname(at(path)), { recursive: true });
  await writeFile(at(path), data);
};

/** An SVG drawn on a 512 square, rendered sharp at `size` pixels. */
const toPng = (svg: string, size: number) =>
  sharp(Buffer.from(svg), { density: 72 * Math.max(1, size / 512) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();

// Square corners: iOS and Android round or mask the icon themselves. The
// maskable one keeps the mark inside Android's centre safe zone.
for (const app of ["studio", "shutter", "admin"]) {
  for (const size of [180, 192, 512]) {
    await write(
      `apps/${app}/public/icons/icon-${size}.png`,
      await toPng(ditherBoothIconSvg(), size),
    );
  }
  await write(
    `apps/${app}/public/icons/icon-maskable-512.png`,
    await toPng(ditherBoothIconSvg({ markScale: 0.46 }), 512),
  );
}

await write(
  "apps/docs/public/favicon.svg",
  ditherBoothIconSvg({ markScale: 0.7, radius: 112 }),
);
await write(
  "apps/docs/src/assets/ditherbooth-mark-light.svg",
  ditherBoothMarkSvg(BRAND_ICON_BACKGROUND),
);
await write(
  "apps/docs/src/assets/ditherbooth-mark-dark.svg",
  ditherBoothMarkSvg("#fff"),
);

// The email draws these at 48 and 20 px tall; twice that for sharp screens.
// Rounded here, as mail apps ignore border-radius on images.
await write(
  "apps/studio/public/email/ditherbooth.png",
  await toPng(ditherBoothIconSvg({ markScale: 0.62, radius: 112 }), 96),
);
await write(
  "apps/studio/public/email/99stud.png",
  await sharp(
    await readFile(at("apps/shutter/public/ressources/99stud-logo.svg")),
    { density: 300 },
  )
    .resize({ height: 40 })
    .png({ compressionLevel: 9 })
    .toBuffer(),
);

console.log("brand assets written");
