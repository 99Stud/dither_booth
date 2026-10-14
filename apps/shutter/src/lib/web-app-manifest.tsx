const WEB_APP_MANIFEST_HREF = "/manifest.webmanifest";

/**
 * Links `public/manifest.webmanifest` at runtime. It cannot live in
 * `index.html`: Bun's HTML bundler tries to resolve every `<link href>` as a
 * build asset and fails on the public-folder path.
 */
export const installWebAppManifestLink = () => {
  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');

  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }

  link.href = WEB_APP_MANIFEST_HREF;
};
