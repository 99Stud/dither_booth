import { STAFF_SESSION_ROUTE_PATH } from "./staff-session.constants";

/*
 * The page's side of `/admin/session`. The token stays in an HttpOnly
 * cookie: the page only learns whether it worked.
 */

/** Signs in; null when it worked, otherwise what to tell staff. */
export async function signInWithStaffPin(pin: string): Promise<string | null> {
  try {
    const response = await fetch(STAFF_SESSION_ROUTE_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin }),
    });

    if (response.ok) return null;

    const body: unknown = await response.json().catch(() => undefined);
    return body && typeof body === "object" && "message" in body
      ? String(body.message)
      : `The admin server answered ${response.status}.`;
  } catch {
    return "Can't reach the booth. Check the Wi-Fi and try again.";
  }
}

/** Ends this browser's session. */
export async function signOutStaff(): Promise<void> {
  await fetch(STAFF_SESSION_ROUTE_PATH, { method: "DELETE" }).catch(() => {});
}
