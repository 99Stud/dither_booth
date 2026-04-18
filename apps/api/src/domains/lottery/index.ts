import { createLotteryLot } from "./mutations/create-lottery-lot";
import { deleteLotteryLot } from "./mutations/delete-lottery-lot";
import { lotteryDraw } from "./mutations/execute-draw";
import { applyLotteryPreset } from "./mutations/apply-lottery-preset";
import { generateLotteryTicket } from "./mutations/generate-lottery-ticket";
import { saveLotteryPreset } from "./mutations/save-lottery-preset";
import { simulateLottery } from "./mutations/simulate-lottery";
import { tuneLottery } from "./mutations/tune-lottery";
import { updateLotteryConfig } from "./mutations/update-lottery-config";
import { updateLotteryLot } from "./mutations/update-lottery-lot";
import { getLotteryAnalytics } from "./queries/get-lottery-analytics";
import { getLotteryConfig } from "./queries/get-lottery-config";
import { getLotteryEvents } from "./queries/get-lottery-events";
import { getLotteryLotForTicket } from "./queries/get-lottery-lot-for-ticket";
import { getLotteryLots } from "./queries/get-lottery-lots";
import { getLotteryPresets } from "./queries/get-lottery-presets";

export const lottery = {
  getLotteryConfig,
  updateLotteryConfig,
  getLotteryLots,
  getLotteryLotForTicket,
  createLotteryLot,
  updateLotteryLot,
  deleteLotteryLot,
  getLotteryAnalytics,
  getLotteryEvents,
  getLotteryPresets,
  saveLotteryPreset,
  applyLotteryPreset,
  lotteryDraw,
  generateLotteryTicket,
  simulateLottery,
  tuneLottery,
};
