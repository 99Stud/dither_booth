import { PRINT_CONFIG_SINGLETON_ID } from "#db/internal/db.constants.ts";
import { CONFIGURE_DITHER_SCHEMA } from "#domains/image-manipulation/internal/image-manipulation.constants.ts";
import type { PrintConfigRow } from "#domains/image-manipulation/internal/image-manipulation.types.ts";
import {
  ditherImage,
  renderDitheredToPng,
} from "#domains/image-manipulation/internal/image-manipulation.utils.ts";
import { publicProcedure } from "#internal/trpc.ts";
import { TRPCError } from "@trpc/server";
import z from "zod";

const DATA_URL_BASE64 = /^data:[^;]+;base64,(.+)$/;

const imagePayloadToBuffer = (image: string) => {
  const dataUrlMatch = DATA_URL_BASE64.exec(image);
  const base64 = dataUrlMatch ? dataUrlMatch[1] : image;

  if (!base64 || base64.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Photo input was empty.",
    });
  }

  return Buffer.from(base64, "base64");
};

export const ditherPreview = publicProcedure
  .input(
    z.object({
      configuration: CONFIGURE_DITHER_SCHEMA,
      image: z.string().min(1, "Photo input is required."),
    }),
  )
  .mutation(async ({ input }) => {
    const inputBuffer = imagePayloadToBuffer(input.image);

    if (inputBuffer.byteLength === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Photo input was empty.",
      });
    }

    const config = CONFIGURE_DITHER_SCHEMA.parse(input.configuration);

    const ditherConfiguration: PrintConfigRow = {
      id: PRINT_CONFIG_SINGLETON_ID,
      brightness: config.brightness,
      contrast: config.contrast,
      ditherModeCode: config.ditherModeCode,
      gamma: config.gamma,
      threshold: config.threshold,
    };

    try {
      const dithered = await ditherImage(inputBuffer, ditherConfiguration);

      return renderDitheredToPng(dithered, ditherConfiguration.threshold);
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to process photo.",
        cause: error,
      });
    }
  });
