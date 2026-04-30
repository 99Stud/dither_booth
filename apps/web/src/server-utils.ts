import { isAbsolute, relative, resolve, sep } from "node:path";

const BLOCKED_PROXY_HEADERS = new Set([
  "connection",
  "forwarded",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function rejectUnsafePath(): never {
  throw new Error("Unsafe static file path.");
}

export function getSafeFileUrl(root: URL, encodedPath: string) {
  const decodedPath = decodeURIComponent(encodedPath);

  if (
    decodedPath.length === 0 ||
    decodedPath.includes("\\") ||
    decodedPath.includes("\0") ||
    isAbsolute(decodedPath)
  ) {
    rejectUnsafePath();
  }

  const rootPath = Bun.fileURLToPath(root);
  const filePath = resolve(rootPath, decodedPath);
  const pathFromRoot = relative(rootPath, filePath);

  if (
    pathFromRoot.length === 0 ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    rejectUnsafePath();
  }

  return Bun.pathToFileURL(filePath);
}

export function getProxiedRequestHeaders(headers: Headers) {
  const proxiedHeaders = new Headers();

  for (const [name, value] of headers) {
    const headerName = name.toLowerCase();

    if (
      BLOCKED_PROXY_HEADERS.has(headerName) ||
      headerName.startsWith("proxy-") ||
      headerName.startsWith("x-forwarded-")
    ) {
      continue;
    }

    proxiedHeaders.append(name, value);
  }

  return proxiedHeaders;
}
