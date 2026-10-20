import { renderBoothPage } from "./device-setup.html";

/**
 * What a phone or laptop shows on its own when it joins the booth Wi-Fi
 * while the booth has no network: pick the venue's, and the booth joins it.
 * Plain HTTP on purpose, no certificate needed; the password only crosses
 * the booth's own WPA2 Wi-Fi.
 */
export function renderCaptivePage() {
  return renderBoothPage({
    title: "Dither Booth Wi-Fi",
    // ds-allow-hardcode: tokens come from the shared booth page shell.
    style: `
  .networks { list-style: none; margin: 0 0 1rem; padding: 0; }
  .network { display: flex; width: 100%; box-sizing: border-box; align-items: center;
    justify-content: space-between; gap: 0.75rem; min-height: 3rem; padding: 0 0.9rem;
    margin: 0 0 0.4rem; border: 0; border-radius: 0.75rem; background: var(--surface);
    color: var(--fg); font: inherit; text-align: left; cursor: pointer; }
  .network[aria-pressed="true"] { outline: 2px solid var(--accent); }
  .network span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  label { display: block; font-weight: 600; margin: 1rem 0 0.35rem; }
  input { display: block; width: 100%; box-sizing: border-box; padding: 0.8rem 0.9rem;
    border: 1px solid var(--muted); border-radius: 0.75rem; background: var(--bg);
    color: var(--fg); font: inherit; }
  .error { color: var(--danger); }
`,
    body: `<section data-state="loading">
  <h1>Booth Wi-Fi</h1>
  <p class="lead">Looking for networks…</p>
</section>

<section data-state="pick-network" hidden>
  <h1>Pick the venue's Wi-Fi</h1>
  <p class="lead">The booth joins it and prints a ticket with its new address.</p>
  <ul class="networks" data-networks></ul>
  <form data-form>
    <label for="ssid">Network name</label>
    <input id="ssid" name="ssid" autocapitalize="off" autocorrect="off" spellcheck="false" required maxlength="32" />
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocapitalize="off" autocorrect="off" minlength="8" maxlength="63" />
    <p><small>Leave it empty only for an open network.</small></p>
    <p class="error" data-error role="alert" hidden></p>
    <button class="button" type="submit" data-join>Join</button>
  </form>
  <p><small>Venue Wi-Fi that keeps devices apart, or none at all? Run the event on
  the booth Wi-Fi: on the iPad, open the Darkroom, then Wi-Fi, then
  <em>Run on booth Wi-Fi</em>.</small></p>
</section>

<section data-state="joining" hidden>
  <h1>Joining <span data-joining-name></span></h1>
  <p class="lead">This page closes when the booth leaves its Wi-Fi.</p>
  <ol>
    <li>Join <strong data-joining-name></strong> on this device.</li>
    <li>Scan the ticket the booth prints: it opens the booth at its new address.</li>
  </ol>
  <p><small>Wrong password? The booth comes back on its own Wi-Fi within a minute
  and prints why. Join it again to retry.</small></p>
</section>

<section data-state="booth-wifi-chosen" hidden>
  <h1>Running on the booth Wi-Fi</h1>
  <p class="lead">Staff chose to run the event on the booth's own Wi-Fi. You can close this page.</p>
  <p>To open the Shutter, scan the second QR on the booth Wi-Fi ticket.</p>
</section>

<section data-state="not-on-booth-wifi" hidden>
  <h1>The booth is online</h1>
  <p class="lead">It's on a network already. Change its Wi-Fi from the Darkroom or the admin's Settings.</p>
</section>

<script>
  const show = (state) => {
    for (const section of document.querySelectorAll("[data-state]")) {
      section.hidden = section.dataset.state !== state;
    }
  };
  const form = document.querySelector("[data-form]");
  const ssidInput = form.elements.ssid;
  const passwordInput = form.elements.password;
  const errorLine = document.querySelector("[data-error]");
  let networks = [];
  const signalLabel = (signal) => signal >= 70 ? "Strong" : signal >= 40 ? "Good" : "Weak";

  const post = async (path, body) => {
    // JSON only: a page on another site can't send this without asking first.
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Something went wrong. Try again.");
  };

  const fail = (error) => {
    errorLine.textContent = error.message;
    errorLine.hidden = false;
  };

  const renderNetworks = (networks) => {
    const list = document.querySelector("[data-networks]");
    list.replaceChildren(...networks.map((network) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "network";
      button.setAttribute("aria-pressed", "false");
      const name = document.createElement("span");
      name.textContent = network.ssid;
      const signal = document.createElement("span");
      // Most venue networks have a password: say so for the ones that don't.
      signal.textContent = (network.secured ? "" : "Open · ") + signalLabel(network.signal);
      signal.style.color = "var(--muted)";
      button.append(name, signal);
      button.addEventListener("click", () => {
        for (const other of list.querySelectorAll(".network")) other.setAttribute("aria-pressed", "false");
        button.setAttribute("aria-pressed", "true");
        ssidInput.value = network.ssid;
        passwordInput.value = "";
        passwordInput.disabled = !network.secured;
        (network.secured ? passwordInput : document.querySelector("[data-join]")).focus();
      });
      item.append(button);
      return item;
    }));
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorLine.hidden = true;
    const ssid = ssidInput.value.trim();
    const password = passwordInput.disabled ? "" : passwordInput.value;
    const picked = networks.find((network) => network.ssid === ssid);
    // Same rule as the booth: only a network the scan saw as open goes without.
    if (!password && !(picked && !picked.secured)) {
      fail(new Error(ssid + " needs its password."));
      passwordInput.focus();
      return;
    }
    if (password && password.length < 8) {
      fail(new Error("Wi-Fi passwords are at least 8 characters."));
      return;
    }
    try {
      await post("/wifi/join", { ssid, password: password || undefined });
      for (const slot of document.querySelectorAll("[data-joining-name]")) slot.textContent = ssid;
      show("joining");
    } catch (error) {
      fail(error);
    }
  });

  ssidInput.addEventListener("input", () => { passwordInput.disabled = false; });


  fetch("/wifi/status", { cache: "no-store" })
    .then((response) => response.json())
    .then((status) => {
      networks = status.nearby || [];
      renderNetworks(networks);
      show(status.state || "pick-network");
    })
    .catch(() => show("pick-network"));
</script>
`,
  });
}
