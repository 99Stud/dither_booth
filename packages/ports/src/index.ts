import { DEFAULT_API_PORT, DEFAULT_WEB_PORT } from "./constants";

export function getPort(name: "API_PORT" | "WEB_PORT") {
  const value = process.env[name];

  if (!value) {
    return name === "API_PORT" ? DEFAULT_API_PORT : DEFAULT_WEB_PORT;
  }

  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid port in environment variable ${name}: ${value}`);
  }

  return port;
}
