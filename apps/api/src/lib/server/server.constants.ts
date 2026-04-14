import { getApiBindHost, getApiInternalOrigin } from "@dither-booth/ports";

export const API_SERVER_LOG_SOURCE = "api.server";
export const API_SERVER_BIND_HOST = getApiBindHost();
export const API_SERVER_ORIGIN = getApiInternalOrigin();
