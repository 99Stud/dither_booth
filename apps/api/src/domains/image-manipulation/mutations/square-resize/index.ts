import { publicProcedure } from "#trpc.ts";
import { encodeBase64, formatToMimeType } from "#utils.ts";
import { TRPCError } from "@trpc/server";
import { octetInputParser } from "@trpc/server/http";
import sharp from "sharp";

export const squareResize = publicProcedure
  .input(octetInputParser)
  .mutation(async ({ input }) => {
    const inputBuffer = Buffer.from(await new Response(input).arrayBuffer());

    if (inputBuffer.byteLength === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Photo input was empty.",
      });
    }

    const image = sharp(inputBuffer, { failOn: "error" });
    const metadata = await image.metadata();
    const width = metadata.width;
    const height = metadata.height;

    if (!width || !height) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Could not determine photo dimensions.",
      });
    }

    const side = Math.min(width, height);
    const outputFormat = metadata.format === "jpeg" ? "jpeg" : metadata.format;

    const resizedBuffer = await image
      .rotate()
      .resize({
        width: side,
        height: side,
        fit: "cover",
        position: "centre",
        withoutEnlargement: true,
      })
      .withMetadata()
      .toFormat(outputFormat ?? "png")
      .toBuffer();
    const resizedBytes = Uint8Array.from(resizedBuffer);
    const mimeType = formatToMimeType(outputFormat);

    return {
      data: encodeBase64(resizedBytes),
      mimeType,
    };
  });
