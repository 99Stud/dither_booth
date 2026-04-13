export const API_SERVER_LOG_SOURCE = "api.server";

export const API_SERVER_HOSTNAME = process.env.MAKE_LOCALLY_ACCESSIBLE
  ? "0.0.0.0"
  : "127.0.0.1";
