import z from "zod";

export function getOptionalStringEnv(name: string) {
  const value = z.string().safeParse(process.env[name]?.trim());

  if (!value.success || value.data.length === 0) {
    return undefined;
  }

  return value.data;
}

export function getStringEnv(name: string, fallback: string) {
  return getOptionalStringEnv(name) ?? fallback;
}
