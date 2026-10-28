import type { BunPlugin } from "bun";

import { extname } from "node:path";

const IMAGE_MIME_TYPES: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// One pattern from the one list, whatever the case of the extension.
const IMAGE_FILTER = new RegExp(
  `(?:${Object.keys(IMAGE_MIME_TYPES)
    .map((extension) => extension.replace(".", "\\."))
    .join("|")})$`,
  "iu",
);

/**
 * A PNG, JPEG, WebP or GIF a browser module imports becomes a data URL, not
 * a file. Bun (1.3.14) breaks both ways of shipping it as a file from the
 * page bundle a server entry imports: the `file` loader writes the asset
 * under `naming.asset` but references it from the bundle without that
 * directory (`/photo-mask-….png` for `assets/photo-mask-….png`), and the
 * `dataurl` loader yields an empty string. A URL that misses is worse than
 * a bigger bundle: a CSS mask that fails to load hides what it masks. Large
 * images belong in `public/`, by URL.
 */
export const inlineImagesPlugin: BunPlugin = {
  name: "inline-images",
  setup(build) {
    build.onLoad({ filter: IMAGE_FILTER }, async ({ path }) => {
      const mimeType = IMAGE_MIME_TYPES[extname(path).toLowerCase()]!;
      const bytes = Buffer.from(await Bun.file(path).arrayBuffer());
      const dataUrl = `data:${mimeType};base64,${bytes.toString("base64")}`;

      return {
        contents: `export default ${JSON.stringify(dataUrl)};`,
        loader: "js",
      };
    });
  },
};
