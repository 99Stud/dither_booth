import { drawLottery } from "./mutations/draw-lottery";
import { getLotteryStatus } from "./queries/get-lottery-status";

export const lottery = {
  drawLottery,
  getLotteryStatus,
};
