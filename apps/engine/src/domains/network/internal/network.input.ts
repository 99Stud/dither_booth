import z from "zod";

/** 802.11 caps an SSID at 32 bytes; WPA2 passphrases are 8–63 characters. */
export const wifiNetworkInput = z.object({
  ssid: z
    .string()
    .min(1)
    .refine((value) => new TextEncoder().encode(value).length <= 32, {
      message: "A Wi-Fi name is at most 32 bytes.",
    }),
  password: z.string().min(8).max(63).optional(),
  connectNow: z.boolean(),
});
