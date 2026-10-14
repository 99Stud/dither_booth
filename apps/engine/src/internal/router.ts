import { browserAutomation } from "#domains/browser-automation/index";
import { event } from "#domains/event/index";
import { healthz } from "#domains/healthz/index";
import { imageManipulation } from "#domains/image-manipulation/index";
import { lottery } from "#domains/lottery/index";
import { printConfiguration } from "#domains/print-configuration/index";
import { receipt } from "#domains/receipt/index";

import { router } from "./trpc";

// Each group's procedures are built on that group's base procedure in
// `./trpc`, which carries its access check.
export const engineRouter = router({
  booth: router({
    getLotteryStatus: lottery.getLotteryStatus,
    prepareReceipt: receipt.prepareReceipt,
    printPreparedReceipt: receipt.printPreparedReceipt,
  }),
  config: router({
    ...event,
    ...printConfiguration,
    ...imageManipulation,
    generateReceipt: receipt.generateReceipt,
    printReceipt: receipt.printReceipt,
    printSampleLotteryTicket: receipt.printSampleLotteryTicket,
  }),
  ops: router({
    ...healthz,
    ...browserAutomation,
  }),
});
