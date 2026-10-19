import { escapeHtml, renderBoothPage, toInlineJson } from "./device-setup.html";

export type DeviceSetupPageOptions = {
  /** Path the page downloads the booth CA from. */
  caDownloadPath: string;
  /** Shutter origins to try, most stable first (`.local` before the IP). */
  shutterOrigins: string[];
  adminOrigin: string;
  darkroomPath: string;
};

/**
 * The page a device opens before it trusts the booth. It checks whether this
 * device already trusts the booth CA (an HTTPS request to the Shutter only
 * succeeds once it does) and shows either the trust steps or the way in.
 */
export function renderDeviceSetupPage(options: DeviceSetupPageOptions) {
  // Replaced by whichever origin answers before the page shows the links.
  const ipShutterOrigin = options.shutterOrigins[0] ?? "";

  return renderBoothPage({
    title: "Set up Dither Booth",
    body: `<section data-state="checking">
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
  <a class="button secondary" data-admin href="${escapeHtml(options.adminOrigin)}">Admin</a>
  <p><small>For the kiosk: in Safari, tap Share → Add to Home Screen, then turn on
  Guided Access in Settings → Accessibility. When this iPad leaves the booth for good,
  remove the profile in VPN &amp; Device Management.</small></p>
</section>

<script>
  const shutterOrigins = ${toInlineJson(options.shutterOrigins)};
  const darkroomPath = ${toInlineJson(options.darkroomPath)};
  const adminPort = ${toInlineJson(new URL(options.adminOrigin).port)};

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
    // The admin on the same host that answered: on the booth Wi-Fi, that's
    // its address there, not the venue's.
    const admin = new URL(origin);
    admin.port = adminPort;
    document.querySelector("[data-admin]").href = admin.origin;
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
`,
  });
}
