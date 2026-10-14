import { API_BIND_HOST, getApiInternalOrigin } from "@dither-booth/ports";

export const API_SERVER_LOG_SOURCE = "api.server";
export const API_SERVER_BIND_HOST = API_BIND_HOST;
export const API_SERVER_ORIGIN = getApiInternalOrigin();
