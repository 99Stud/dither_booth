import type {
  UpdateActionResult,
  UpdateRequest,
  UpdateSnapshot,
} from "./update.protocol";

import { UPDATE_ROUTE_PATH } from "./update.constants";
import {
  updateActionResultSchema,
  updateSnapshotSchema,
} from "./update.protocol";

/**
 * The snapshot, or null off the booth, where the admin server doesn't
 * serve the route: there its page fallback answers with HTML and a 200.
 */
export async function fetchUpdateSnapshot(
  signal?: AbortSignal,
): Promise<UpdateSnapshot | null> {
  const response = await fetch(UPDATE_ROUTE_PATH, {
    headers: { accept: "application/json" },
    signal,
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    throw new Error(`The admin server answered ${response.status}.`);
  }

  const parsed = updateSnapshotSchema.safeParse(
    await response.json().catch(() => undefined),
  );

  return parsed.success ? parsed.data : null;
}

export async function requestUpdateAction(
  request: UpdateRequest,
): Promise<UpdateActionResult> {
  try {
    const response = await fetch(UPDATE_ROUTE_PATH, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });
    const parsed = updateActionResultSchema.safeParse(
      await response.json().catch(() => undefined),
    );

    return parsed.success
      ? parsed.data
      : {
          ok: false,
          code: "failed",
          message: `The admin server answered ${response.status}.`,
        };
  } catch {
    return {
      ok: false,
      code: "failed",
      message: "Can't reach the admin server.",
    };
  }
}
