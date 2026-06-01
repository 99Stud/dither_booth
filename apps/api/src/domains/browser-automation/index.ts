import { generateHeirveyReceipt } from "./mutations/generate-heirvey-receipt";
import { generateReceipt } from "./mutations/generate-receipt";
import { primeReceipt } from "./mutations/prime-receipt";

export const browserAutomation = {
  generateReceipt,
  generateHeirveyReceipt,
  primeReceipt,
};
