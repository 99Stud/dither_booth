import { endVisit } from "./mutations/end-visit";
import { startVisit } from "./mutations/start-visit";
import { getVisitStats } from "./queries/get-visit-stats";

export const visit = {
  getVisitStats,
};

export const visitBooth = {
  endVisit,
  startVisit,
};
