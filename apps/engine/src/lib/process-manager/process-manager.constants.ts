import z from "zod";

export const runtimeProcessManagerSchema = z.enum([
  "pm2",
  "turborepo",
  "unknown",
]);

export const configuredProcessManagerSchema =
  runtimeProcessManagerSchema.extract(["pm2", "turborepo"]);
