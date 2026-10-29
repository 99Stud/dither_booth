/**
 * The Dither Booth mark, a pixel ghost dissolving into dither, as path data in
 * one colour. The React mark, the favicons and the generated app icons
 * (`packages/ui/scripts/brand-assets.ts`) all draw from here.
 */
export const DITHER_BOOTH_MARK = {
  height: 703,
  paths: [
    "M352.054 58.684V0H58.676v58.684H0v234.738h58.676v-58.684h58.675v58.684h58.676v58.684h58.676v-58.684h58.675v-58.684h58.676v58.684h58.676V58.684zM176.027 234.738v-58.685h58.676v58.685z",
    "M117.351 293.422H58.676v58.684h58.675zM352.054 293.422h-58.676v58.684h58.676zM58.676 352.106H0v58.685h58.676zM117.351 410.791H58.676v58.684h58.675zM176.027 352.106h-58.676v58.685h58.676zM234.703 410.791h-58.676v58.684h58.676zM234.703 528.159h-58.676v58.685h58.676zM293.378 352.106h-58.675v58.685h58.675zM176.027 643.768h-58.676v58.684h58.676zM293.378 643.768h-58.675v58.684h58.675zM352.054 410.791h-58.676v58.684h58.676zM410.73 352.106h-58.676v58.685h58.676zM58.676 528.159H0v58.685h58.676zM410.73 528.159h-58.676v58.685h58.676z",
  ],
  /** One square of the dither, the mark's grid step. */
  pixel: 58.676,
  width: 411,
} as const;

/**
 * Behind the mark on every icon: the dark theme's background. A literal, as
 * it is baked into image files where no theme token applies.
 */
export const BRAND_ICON_BACKGROUND = "#09090b"; // ds-allow-hardcode: rendered into icon files

/**
 * The mark alone, in `fill`, as a standalone SVG document. `fill` is the colour
 * to draw it in, e.g. `"#fff"` on a dark surface.
 */
export const ditherBoothMarkSvg = (fill: string) => {
  const { height, paths, width } = DITHER_BOOTH_MARK;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${paths
    .map((d) => `<path fill="${fill}" d="${d}"/>`)
    .join("")}</svg>`;
};

/**
 * The app icon as SVG: the white mark centred on a dark square. `markScale`
 * is the mark's height as a share of the side; `radius` rounds the corners
 * (0 for platforms that mask the icon themselves).
 */
export const ditherBoothIconSvg = ({
  markScale = 0.6,
  radius = 0,
  size = 512,
}: {
  markScale?: number;
  radius?: number;
  size?: number;
} = {}) => {
  const { height, paths, width } = DITHER_BOOTH_MARK;
  const scale = (size * markScale) / height;
  const x = (size - width * scale) / 2;
  const y = (size - height * scale) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${BRAND_ICON_BACKGROUND}"/><g transform="translate(${x} ${y}) scale(${scale})">${paths
    .map((d) => `<path fill="#fff" d="${d}"/>`)
    .join("")}</g></svg>`;
};

/** The browser-tab icon: the app icon with rounded corners, as a data URL. */
export const DITHER_BOOTH_FAVICON_URL = `data:image/svg+xml,${encodeURIComponent(
  ditherBoothIconSvg({ markScale: 0.7, radius: 112 }),
)}`;

/**
 * Adds the tab icon and, when given, the Home Screen icon to the document
 * head. At runtime because Bun's HTML bundler tries to bundle every
 * `<link href>` in index.html, public-folder paths included.
 */
export const linkBrandIcons = ({
  appleTouchIcon,
}: { appleTouchIcon?: string } = {}) => {
  const icon = document.createElement("link");
  icon.rel = "icon";
  icon.type = "image/svg+xml";
  icon.href = DITHER_BOOTH_FAVICON_URL;
  document.head.appendChild(icon);

  if (appleTouchIcon) {
    const touchIcon = document.createElement("link");
    touchIcon.rel = "apple-touch-icon";
    touchIcon.href = appleTouchIcon;
    document.head.appendChild(touchIcon);
  }
};
