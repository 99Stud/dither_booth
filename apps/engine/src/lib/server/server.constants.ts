import { ENGINE_BIND_HOST, getEngineInternalOrigin } from "@dither-booth/ports";

export const ENGINE_SERVER_LOG_SOURCE = "engine.server";
export const ENGINE_SERVER_BIND_HOST = ENGINE_BIND_HOST;
export const ENGINE_SERVER_ORIGIN = getEngineInternalOrigin();
