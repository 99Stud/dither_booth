import { publicProcedure } from "#trpc.ts";

import { printImageSchema } from "./print/schema.ts";
import {
  decodeInputToBuffer,
  ditherProcessedImage,
  preprocessImage,
  renderDitheredToPng,
} from "./print/utils.ts";

export const previewPrint = publicProcedure
  .input(printImageSchema)
  .mutation(async ({ input }) => {
    const fileBuffer = decodeInputToBuffer(input);
    const imageBuffer = await preprocessImage(fileBuffer, input);
    const dithered = ditherProcessedImage(imageBuffer, input.ditherMode);
    const png = await renderDitheredToPng(dithered, input.threshold);

    return {
      preview: `data:image/png;base64,${png.data.toString("base64")}`,
      width: png.width,
      height: png.height,
    };
  });
