/**
 * Test the admin and the Darkroom from a phone on the same network.
 *
 * Serves a small setup page over plain HTTP (a phone can't open the HTTPS
 * apps before it trusts the local certificate) that hands out the mkcert
 * root CA, the public certificate only, never its key, and links to the
 * apps. Prints a QR code to open it. Runs until Ctrl+C.
 */
import {
  getAdminOrigin,
  getShutterOrigin,
  getWebPublicIp,
  getWebTlsCaPath,
} from "@dither-booth/ports";
import { DARKROOM_PATH } from "@dither-booth/shared/darkroom";
import { existsSync } from "node:fs";
import { renderUnicodeCompact } from "uqr";

import { ENGINE_REPO_ROOT } from "#lib/constants";

const PHONE_SETUP_PORT = Number(process.env.PHONE_SETUP_PORT ?? 3199);
const CA_DOWNLOAD_PATH = "/dither-booth-dev-ca.crt";
const CERT_GENERATE_COMMAND =
  "bun run --filter @dither-booth/engine cert:generate <LAN_IP>";

const repoPathOptions = { repoRoot: ENGINE_REPO_ROOT };
const [publicIp, caPath, adminOrigin, shutterOrigin] = await Promise.all([
  getWebPublicIp(repoPathOptions),
  getWebTlsCaPath(repoPathOptions),
  getAdminOrigin(repoPathOptions),
  getShutterOrigin(repoPathOptions),
]).catch(() => {
  throw new Error(
    `No local certificate yet. Run "${CERT_GENERATE_COMMAND}" first.`,
  );
});

if (!existsSync(caPath)) {
  throw new Error(
    `The mkcert root CA is missing at ${caPath}. Run "${CERT_GENERATE_COMMAND}".`,
  );
}

const setupUrl = `http://${publicIp}:${PHONE_SETUP_PORT}`;
const darkroomUrl = new URL(DARKROOM_PATH, shutterOrigin).toString();

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Dither Booth on your phone</title>
<style>
  :root { color-scheme: light dark; font-family: -apple-system, system-ui, sans-serif; }
  body { margin: 0 auto; max-width: 32rem; padding: 1.5rem 1.25rem 3rem; line-height: 1.45; }
  h1 { font-size: 1.75rem; margin: 0 0 1.25rem; }
  ol { padding-left: 1.25rem; } li { margin-bottom: 0.9rem; }
  a.button { display: block; text-align: center; padding: 0.85rem 1rem; margin: 0.6rem 0;
    border-radius: 999px; background: #0a84ff; color: white; font-weight: 600; text-decoration: none; }
  a.secondary { background: rgba(127,127,127,.18); color: inherit; }
  small { opacity: .65; }
</style>
</head>
<body>
<h1>Dither Booth on your phone</h1>
<p><strong>Once per phone</strong>, trust this computer's development certificate:</p>
<ol>
  <li><a class="button" href="${CA_DOWNLOAD_PATH}">Download the certificate</a>
    Safari asks to allow a configuration profile: tap <em>Allow</em>.</li>
  <li>Open <em>Settings → General → VPN &amp; Device Management</em>, tap
    <em>mkcert development CA</em>, then <em>Install</em>.</li>
  <li>Open <em>Settings → General → About → Certificate Trust Settings</em>
    and turn on full trust for <em>mkcert development CA</em>.</li>
</ol>
<p>Then open the apps:</p>
<a class="button" href="${adminOrigin}">Admin</a>
<a class="button secondary" href="${darkroomUrl}">Darkroom</a>
<p><small>Tip: in Safari, Share → Add to Home Screen opens the admin full screen, like an app.
Remove the profile from VPN &amp; Device Management when you're done testing.</small></p>
</body>
</html>`;

const server = Bun.serve({
  hostname: "0.0.0.0",
  port: PHONE_SETUP_PORT,
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === CA_DOWNLOAD_PATH) {
      return new Response(Bun.file(caPath), {
        headers: {
          // iOS installs a CA served with this type as a profile.
          "content-type": "application/x-x509-ca-cert",
          "content-disposition":
            'attachment; filename="dither-booth-dev-ca.crt"',
        },
      });
    }
    if (pathname === "/") {
      return new Response(page, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`
Scan with the iPhone's camera (same Wi-Fi as this computer):

${renderUnicodeCompact(setupUrl, { border: 2 })}
  ${setupUrl}

  Admin     ${adminOrigin}
  Darkroom  ${darkroomUrl}

Keep "bun run dev" running in another terminal. Ctrl+C stops this page.
`);

process.on("SIGINT", () => {
  void server.stop();
  process.exit(0);
});
