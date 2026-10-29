import { fetchAdminJson, postAdminJson } from "#lib/admin-api/admin-api.client";

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

/** The snapshot, or null off the booth, where the route isn't served. */
export const fetchUpdateSnapshot = (
  signal?: AbortSignal,
): Promise<UpdateSnapshot | null> =>
  fetchAdminJson(UPDATE_ROUTE_PATH, updateSnapshotSchema, signal);

export const requestUpdateAction = (
  request: UpdateRequest,
): Promise<UpdateActionResult> =>
  postAdminJson(
    UPDATE_ROUTE_PATH,
    request,
    updateActionResultSchema,
    (message) => ({
      ok: false as const,
      code: "failed" as const,
      message,
    }),
  );
