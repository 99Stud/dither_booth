export const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

// `<` can't close the inline script from inside a JSON string.
export const toInlineJson = (value: unknown) =>
  JSON.stringify(value).replaceAll("<", "\\u003c");

/**
 * The booth's plain-HTTP pages: served before a device trusts the booth, so
 * they carry their own look instead of the app bundle's.
 */
export function renderBoothPage(options: {
  title: string;
  body: string;
  /** Rules on top of the shared ones. */
  style?: string;
}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(options.title)}</title>
<style>
  /* ds-allow-hardcode: standalone page served before the app bundle, so it
     defines its own tokens here instead of loading the UI theme. */
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --fg: #111111; --muted: #6b6b6b; --accent: #0a64d6;
    --on-accent: #ffffff; --surface: #f2f2f4; --ok: #1d7a3e; --danger: #c4122f;
    font-family: -apple-system, system-ui, sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #111113; --fg: #f4f4f5; --muted: #a1a1aa; --accent: #2b6fd6;
      --on-accent: #ffffff; --surface: #1f1f23; --ok: #4ade80; --danger: #ff6b81; }
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
${options.style ?? ""}
</style>
</head>
<body>
${options.body}</body>
</html>`;
}
