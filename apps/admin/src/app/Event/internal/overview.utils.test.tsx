import { describe, expect, test } from "bun:test";

import type { VisitStats } from "./Event.types";
import type { OddsPrize } from "./lottery-odds.utils";

import {
  formatHour,
  formatHourRange,
  formatTimeAtBooth,
  type OverviewEvent,
  summarizeOverview,
} from "./overview.utils";

/** The booth's clock: 31 Oct 2026, `h:m` local time. */
const at = (h: number, m = 0) => new Date(2026, 9, 31, h, m);
const iso = (h: number, m = 0) => at(h, m).toISOString();

const stats = (overrides: Partial<VisitStats> = {}): VisitStats => ({
  visits: 0,
  uncounted: 0,
  captured: 0,
  prints: 0,
  failed: 0,
  abandoned: 0,
  wins: 0,
  losses: 0,
  avgDurationS: null,
  firstVisitAt: null,
  lastVisitAt: null,
  recentVisits: 0,
  hourly: [],
  busiestHour: null,
  failedVisits: [],
  lastWinAt: null,
  ...overrides,
});

/** Consecutive hours from `fromHour`, with these visits each. */
const hours = (fromHour: number, visits: number[]) =>
  visits.map((count, index) => ({
    hour: new Date(2026, 9, 31, fromHour + index).toISOString(),
    visits: count,
  }));

const night = (overrides: Partial<VisitStats> = {}) =>
  stats({
    visits: 168,
    captured: 168,
    prints: 167,
    failed: 1,
    wins: 56,
    losses: 112,
    avgDurationS: 80,
    firstVisitAt: iso(19),
    lastVisitAt: iso(22, 58),
    recentVisits: 2,
    hourly: hours(19, [30, 41, 50, 45, 2]),
    busiestHour: { hour: iso(21), visits: 50 },
    ...overrides,
  });

const prize = (overrides: Partial<OddsPrize> & { id: string }): OddsPrize => ({
  title: overrides.id,
  rarity: "common",
  weight: 1,
  remainingQuantity: 50,
  ...overrides,
});

const event = (
  overrides: Partial<OverviewEvent["lottery"]> = {},
  prizes: OddsPrize[] = [prize({ id: "Sticker" })],
  times: OverviewEvent["campaign"] = { startsAt: iso(18), endsAt: null },
): OverviewEvent => ({
  campaign: times,
  lottery: {
    enabled: true,
    noWinWeight: 50,
    winCooldownMinutes: 0,
    ...overrides,
  },
  prizes,
});

const summarize = ({
  visitStats = night(),
  overviewEvent = event(),
  boothProblems = [] as string[] | null,
  estimatedGuestsPerHour = 60,
  now = at(23),
} = {}) =>
  summarizeOverview({
    stats: visitStats,
    event: overviewEvent,
    boothProblems,
    estimatedGuestsPerHour,
    now,
  });

describe("formatTimeAtBooth", () => {
  test("says seconds, then minutes and seconds, then hours", () => {
    expect(formatTimeAtBooth(6)).toBe("6 s");
    expect(formatTimeAtBooth(59)).toBe("59 s");
    expect(formatTimeAtBooth(60)).toBe("1 min");
    expect(formatTimeAtBooth(80)).toBe("1 min 20 s");
    expect(formatTimeAtBooth(3599)).toBe("59 min 59 s");
    expect(formatTimeAtBooth(3900)).toBe("1 h 5 min");
  });
});

describe("formatHour and formatHourRange", () => {
  test("read the booth's 24-hour clock", () => {
    expect(formatHour(iso(22))).toBe("22:00");
    expect(formatHourRange(iso(23))).toBe("23:00 to 00:00");
  });
});

describe("summarizeOverview: the headline", () => {
  test("invites the first guest before there is one", () => {
    const summary = summarize({ visitStats: stats() });

    expect(summary.mood).toBe("not-started");
    expect(summary.headline).toBe(
      "No guests yet. They show up here from their first tap on Start.",
    );
  });

  test("calls it busy when guests keep coming", () => {
    const summary = summarize({ visitStats: night({ recentVisits: 9 }) });

    expect(summary.mood).toBe("busy");
    expect(summary.headline).toBe(
      "Busy right now. 168 guests so far, 9 in the last 15 minutes.",
    );
  });

  test("calls it steady in between, with the last guest when none is recent", () => {
    expect(summarize().headline).toBe(
      "Going well. 168 guests so far, 2 in the last 15 minutes.",
    );

    const summary = summarize({
      visitStats: night({ recentVisits: 0, lastVisitAt: iso(22, 40) }),
    });
    expect(summary.mood).toBe("steady");
    expect(summary.headline).toBe(
      "Going well. 168 guests so far, the last one 20 minutes ago.",
    );
  });

  test("calls it quiet after half an hour without a guest", () => {
    const summary = summarize({
      visitStats: night({ recentVisits: 0, lastVisitAt: iso(22) }),
    });

    expect(summary.mood).toBe("quiet");
    expect(summary.headline).toBe(
      "Quiet for now. 168 guests so far, the last one 1 hour ago.",
    );
  });

  test("speaks of one guest in the singular", () => {
    const summary = summarize({
      visitStats: stats({
        visits: 1,
        firstVisitAt: iso(22, 59),
        lastVisitAt: iso(22, 59),
        recentVisits: 1,
      }),
    });

    expect(summary.headline).toBe(
      "Going well. 1 guest so far, 1 in the last 15 minutes.",
    );
  });
});

describe("summarizeOverview: the event's start and end", () => {
  test("says when the event starts, before it does", () => {
    const later = summarize({
      visitStats: stats({ uncounted: 3 }),
      overviewEvent: event({}, undefined, {
        startsAt: iso(23, 30),
        endsAt: null,
      }),
    });
    expect(later.mood).toBe("upcoming");
    expect(later.headline).toBe(
      "Starts at 23:30. Visits before then are tests and don't count.",
    );

    const tomorrow = summarize({
      visitStats: stats(),
      overviewEvent: event({}, undefined, {
        startsAt: new Date(2026, 10, 1, 19).toISOString(),
        endsAt: null,
      }),
    });
    expect(tomorrow.headline).toBe(
      "Starts on Sun 1 Nov at 19:00. Visits before then are tests and don't count.",
    );
  });

  test("says the event ended, and how many came", () => {
    const ended = summarize({
      overviewEvent: event({}, undefined, {
        startsAt: iso(18),
        endsAt: iso(22, 30),
      }),
    });
    expect(ended.mood).toBe("ended");
    expect(ended.headline).toBe("This event ended at 22:30. 168 guests came.");

    const empty = summarize({
      visitStats: stats(),
      overviewEvent: event({}, undefined, {
        startsAt: iso(18),
        endsAt: iso(22, 30),
      }),
    });
    expect(empty.headline).toBe("This event ended at 22:30, with no guests.");
  });

  test("asks for the event's start and end while it has neither", () => {
    const { attention } = summarize({
      visitStats: night({ failed: 0 }),
      overviewEvent: event({}, undefined, { startsAt: null, endsAt: null }),
    });

    expect(attention).toEqual([
      {
        kind: "times",
        text: "Set when the event starts and ends, so setup tests don't count.",
        target: "details",
      },
    ]);
  });
});

describe("summarizeOverview: what a client may see", () => {
  test("holds the event's outcome and nothing staff-only", () => {
    const { shareable } = summarize();

    expect(shareable).toEqual({
      guests: 168,
      captured: 168,
      prints: 167,
      walkedAway: 0,
      printShare: 167 / 168,
      prizesWon: 56,
      guestsPerWin: 3,
      timeAtBoothS: 80,
      busiestHour: { hour: iso(21), visits: 50 },
    });
  });

  test("has no prizes won while the lottery never drew", () => {
    const { shareable } = summarize({
      visitStats: night({ wins: 0, losses: 0 }),
    });

    expect(shareable.prizesWon).toBeNull();
    expect(shareable.guestsPerWin).toBeNull();
  });

  test("has no shares before the first guest", () => {
    const { shareable } = summarize({ visitStats: stats() });

    expect(shareable.printShare).toBeNull();
    expect(shareable.guestsPerWin).toBeNull();
  });
});

describe("summarizeOverview: needs a look", () => {
  test("is empty when all is well", () => {
    expect(summarize({ visitStats: night({ failed: 0 }) }).attention).toEqual(
      [],
    );
  });

  test("lists failed prints first, then the booth, then the prizes", () => {
    const { attention } = summarize({
      visitStats: night({
        failed: 3,
        failedVisits: [
          { startedAt: iso(21, 42), ticketRef: "000123" },
          { startedAt: iso(20, 5), ticketRef: null },
        ],
      }),
      boothProblems: ["Paper is running low."],
      overviewEvent: event({}, [prize({ id: "Hat", remainingQuantity: 1 })]),
    });

    expect(attention).toEqual([
      {
        kind: "failed-print",
        text: "Ticket 000123 didn't print at 21:42.",
        target: "control-center",
      },
      {
        kind: "failed-print",
        text: "A ticket didn't print at 20:05.",
        target: "control-center",
      },
      {
        kind: "failed-print",
        text: "1 more ticket didn't print.",
        target: "control-center",
      },
      {
        kind: "booth",
        text: "Paper is running low.",
        target: "control-center",
      },
      {
        kind: "prize-low",
        text: "Only 1 “Hat” left.",
        target: "restock",
        prizeId: "Hat",
      },
    ]);
  });

  test("dates a failed print from another day", () => {
    const { attention } = summarize({
      visitStats: night({
        failed: 1,
        failedVisits: [
          {
            startedAt: new Date(2026, 9, 30, 21, 42).toISOString(),
            ticketRef: null,
          },
        ],
      }),
    });

    expect(attention[0]?.text).toBe(
      "A ticket didn't print on Fri 30 Oct at 21:42.",
    );
  });

  test("warns about a prize the forecast sees running out within the hour", () => {
    // 42 guests an hour since 19:00, everyone wins: 10 prizes last ~14 min.
    const { attention } = summarize({
      overviewEvent: event({ noWinWeight: 0 }, [
        prize({ id: "Sticker", remainingQuantity: 10 }),
      ]),
      visitStats: night({ failed: 0 }),
    });

    expect(attention).toEqual([
      {
        kind: "prize-low",
        text: "“Sticker” could run out within 15 min.",
        target: "restock",
        prizeId: "Sticker",
      },
    ]);
  });

  test("names a prize that ran out", () => {
    const { attention } = summarize({
      overviewEvent: event({}, [
        prize({ id: "Sticker" }),
        prize({ id: "Hat", remainingQuantity: 0 }),
      ]),
      visitStats: night({ failed: 0 }),
    });

    expect(attention).toEqual([
      {
        kind: "prize-low",
        text: "“Hat” has run out.",
        target: "restock",
        prizeId: "Hat",
      },
    ]);
  });

  test("leaves the prizes alone while the lottery is off", () => {
    const { attention } = summarize({
      overviewEvent: event({ enabled: false }, [
        prize({ id: "Hat", remainingQuantity: 0 }),
      ]),
      visitStats: night({ failed: 0 }),
    });

    expect(attention).toEqual([]);
  });

  test("says nothing about the booth until its health is known", () => {
    expect(
      summarize({ boothProblems: null, visitStats: night({ failed: 0 }) })
        .attention,
    ).toEqual([]);
  });
});

describe("summarizeOverview: the lottery", () => {
  test("forecasts with the staff's estimate during the first hour", () => {
    const { lottery } = summarize({
      visitStats: night({
        visits: 40,
        firstVisitAt: iso(22, 30),
        hourly: hours(22, [40, 0]),
      }),
      estimatedGuestsPerHour: 25,
    });

    expect(lottery.guestsPerHour).toBe(25);
    expect(lottery.isPaceMeasured).toBe(false);
  });

  test("forecasts with the event's own pace after an hour", () => {
    const { lottery } = summarize({
      visitStats: night({
        visits: 160,
        hourly: hours(19, [40, 40, 40, 40, 0]),
      }),
      estimatedGuestsPerHour: 25,
    });

    expect(lottery.guestsPerHour).toBe(40);
    expect(lottery.isPaceMeasured).toBe(true);
  });

  test("measures a long event's pace over the hours shown, not since its start", () => {
    const { lottery } = summarize({
      visitStats: night({
        visits: 900,
        firstVisitAt: new Date(2026, 6, 18).toISOString(),
        hourly: hours(0, [...Array(23).fill(2), 2]),
      }),
    });

    // 48 guests from 00:00 to 23:00.
    expect(lottery.guestsPerHour).toBe(2);
    expect(lottery.isPaceMeasured).toBe(true);
  });

  test("knows when the next win is possible during a pause after a win", () => {
    const paused = summarize({
      overviewEvent: event({ winCooldownMinutes: 9 }),
      visitStats: night({ lastWinAt: iso(22, 55) }),
    });
    expect(paused.lottery.nextWinAt).toBe(iso(23, 4));

    const over = summarize({
      overviewEvent: event({ winCooldownMinutes: 9 }),
      visitStats: night({ lastWinAt: iso(22, 40) }),
    });
    expect(over.lottery.nextWinAt).toBeNull();
  });
});
