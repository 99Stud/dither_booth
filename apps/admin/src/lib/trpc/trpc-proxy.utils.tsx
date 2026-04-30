import { TRPC_PROXY_PATH } from "./trpc.constants";

export const getTrpcProxyUpstreamPath = (pathWithSearch: string) => {
  const queryIndex = pathWithSearch.indexOf("?");
  const pathname =
    queryIndex === -1 ? pathWithSearch : pathWithSearch.slice(0, queryIndex);
  const search = queryIndex === -1 ? "" : pathWithSearch.slice(queryIndex);

  const upstreamPath = pathname.startsWith(`${TRPC_PROXY_PATH}/`)
    ? pathname.slice(TRPC_PROXY_PATH.length)
    : pathname === TRPC_PROXY_PATH
      ? "/"
      : pathname;

  return `${upstreamPath}${search}`;
};
