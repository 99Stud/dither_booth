export type DeviceSetupPageOptions = {
  /** Path the page downloads the booth CA from. */
  caDownloadPath: string;
  /** Shutter origins to try, most stable first (`.local` before the IP). */
  shutterOrigins: string[];
  adminOrigin: string;
  darkroomPath: string;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

// `<` can't close the inline script from inside a JSON string.
const toInlineJson = (value: unknown) =>
  JSON.stringify(value).replaceAll("<", "\\u003c");

/**
 * The page a device opens before it trusts the booth. It checks whether this
 * device already trusts the booth CA (an HTTPS request to the Shutter only
 * succeeds once it does) and shows either the trust steps or the way in.
 */
export function renderDeviceSetupPage(options: DeviceSetupPageOptions) {
  const ipShutterOrigin = options.shutterOrigins.at(-1) ?? "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Set up Dither Booth</title>
<style>
  /* ds-allow-hardcode: standalone page served before the app bundle, so it
     defines its own tokens here instead of loading the UI theme. */
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --fg: #111111; --muted: #6b6b6b; --accent: #0a64d6;
    --on-accent: #ffffff; --surface: #f2f2f4; --ok: #1d7a3e;
    font-family: -apple-system, system-ui, sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #111113; --fg: #f4f4f5; --muted: #a1a1aa; --accent: #2b6fd6;
      --on-accent: #ffffff; --surface: #1f1f23; --ok: #4ade80; }
  }
  body { margin: 0 auto; max-width: 32rem; padding: 1.5rem 1rem 3rem;
    line-height: 1.45; background: var(--bg); color: var(--fg); }
  h1 { font-size: 1.75rem; margin: 0 0 0.5rem; }
  p.lead { color: var(--muted); margin: 0 0 1.5rem; }
  ol { padding-left: 1.25rem; } li { margin-bottom: 1rem; }
  .button { display: block; box-sizing: border-box; width: 100%; text-align: center;
    padding: 0.9rem 1rem; margin: 0.6rem 0; border: 0; border-radius: 999px;
    background: var(--accent); color: var(--on-accent); font: inherit;
    font-weight: 600; text-decoration: none; cursor: pointer; }
  .button.secondary { background: var(--surface); color: var(--fg); }
  .status { font-weight: 600; color: var(--ok); }
  [hidden] { display: none !important; }
  small { color: var(--muted); }
</style>
</head>
<body>
<section data-state="checking">
  <h1>Set up Dither Booth</h1>
  <p class="lead">Checking whether this device already trusts the booth…</p>
</section>

<section data-state="not-safari" hidden>
  <h1>Open this page in Safari</h1>
  <p class="lead">Only Safari can install the booth certificate on an iPad or iPhone.
  Copy this address and paste it in Safari:</p>
  <p><strong data-current-url></strong></p>
</section>

<section data-state="needs-trust" hidden>
  <h1>Set up Dither Booth</h1>
  <p class="lead">Once per device: trust the booth so Safari opens the Shutter and allows the camera.</p>
  <ol>
    <li><a class="button" href="${escapeHtml(options.caDownloadPath)}">Download the certificate</a>
      Safari asks to allow a configuration profile: tap <em>Allow</em>, then <em>Close</em>.</li>
    <li>Open <em>Settings → General → VPN &amp; Device Management</em>, tap the
      <em>mkcert</em> profile, then <em>Install</em>.</li>
    <li>Open <em>Settings → General → About → Certificate Trust Settings</em>
      and turn on full trust for <em>mkcert</em>.</li>
  </ol>
  <button class="button secondary" type="button" data-check>I've done it, check again</button>
  <p data-still-untrusted hidden><small>Not trusted yet. Check that full trust is on in step 3, then try again.</small></p>
</section>

<section data-state="ready" hidden>
  <h1>This device is ready</h1>
  <p class="lead"><span class="status">Trusts the booth.</span> Open the Shutter to start.</p>
  <a class="button" data-shutter href="${escapeHtml(ipShutterOrigin)}">Open the Shutter</a>
  <a class="button secondary" data-darkroom href="${escapeHtml(ipShutterOrigin + options.darkroomPath)}">Darkroom</a>
  <a class="button secondary" href="${escapeHtml(options.adminOrigin)}">Admin</a>
  <p><small>For the kiosk: in Safari, tap Share → Add to Home Screen, then turn on
  Guided Access in Settings → Accessibility. When this iPad leaves the booth for good,
  remove the profile in VPN &amp; Device Management.</small></p>
</section>

<script>
  const shutterOrigins = ${toInlineJson(options.shutterOrigins)};
  const darkroomPath = ${toInlineJson(options.darkroomPath)};

  const show = (state) => {
    for (const section of document.querySelectorAll("[data-state]")) {
      section.hidden = section.dataset.state !== state;
    }
  };

  // Chrome, Firefox and in-app browsers on iOS can't install a profile.
  const isIosNotSafari = () => {
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return isIos && /CriOS|FxiOS|EdgiOS|OPiOS|GSA|Instagram|FBAN|FBAV/.test(ua);
  };

  // An opaque response means TLS succeeded: the device trusts the booth CA.
  const probe = (origin) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    return fetch(origin + "/healthz", { mode: "no-cors", cache: "no-store", signal: controller.signal })
      .then(() => true, () => false)
      .finally(() => clearTimeout(timeout));
  };

  const check = async () => {
    const results = await Promise.all(shutterOrigins.map(probe));
    // The first reachable origin is the most stable one: a .local link keeps
    // working when the booth gets a new IP at the next venue.
    const origin = shutterOrigins.find((_, index) => results[index]);
    if (!origin) return false;
    document.querySelector("[data-shutter]").href = origin;
    document.querySelector("[data-darkroom]").href = origin + darkroomPath;
    show("ready");
    return true;
  };

  document.querySelector("[data-current-url]").textContent = location.href;
  document.querySelector("[data-check]").addEventListener("click", async () => {
    document.querySelector("[data-still-untrusted]").hidden = await check();
  });

  if (isIosNotSafari()) {
    show("not-safari");
  } else {
    check().then((trusted) => { if (!trusted) show("needs-trust"); });
  }
</script>
</body>
</html>`;
}
