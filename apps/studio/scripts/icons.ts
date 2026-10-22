// Renders the Home Screen icons from the 99Stud logo. iOS ignores an SVG
// apple-touch-icon, so these are PNGs, committed; run again if the logo
// changes: bun scripts/icons.ts
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dir, "..");
const logo = resolve(root, "../shutter/public/ressources/99stud-logo.svg");

for (const size of [180, 192, 512]) {
  // The logo on a solid square, with room around it: the platforms round
  // or mask the corners.
  const inner = Math.round(size * 0.62);
  const mark = await sharp(logo, { density: 600 })
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .negate({ alpha: false })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: "#09090b" },
  })
    .composite([{ input: mark, gravity: "center" }])
    .png()
    .toFile(resolve(root, `public/icons/icon-${size}.png`));
}
console.log("icons written");
