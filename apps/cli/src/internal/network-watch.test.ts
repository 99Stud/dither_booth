import { describe, expect, test } from "bun:test";

import {
  HOTSPOT_IDLE_RETRY_MS,
  INITIAL_WATCH_STATE,
  MDNS_RESTART_BACKOFF_MS,
  OFFLINE_GRACE_MS,
  decideNetworkAction,
  parseBusctlString,
  shouldReclaimMdnsName,
  type WatchInput,
  type WatchState,
} from "./network-watch";

const base: WatchInput = {
  connecting: false,
  holdHotspot: false,
  hotspotActive: false,
  now: 0,
  online: false,
  stations: 0,
};

/** Runs ticks in order and returns every action. */
function ticks(inputs: Partial<WatchInput>[]) {
  let state: WatchState = INITIAL_WATCH_STATE;
  return inputs.map((input) => {
    const result = decideNetworkAction({ ...base, ...input }, state);
    state = result.state;
    return result.action;
  });
}

describe("network watch", () => {
  test("opens the booth Wi-Fi only after the grace period without a network", () => {
    expect(
      ticks([
        { now: 0 },
        { now: OFFLINE_GRACE_MS - 1 },
        { now: OFFLINE_GRACE_MS },
      ]),
    ).toEqual(["none", "none", "start-hotspot"]);
  });

  test("a network coming back resets the grace period", () => {
    expect(
      ticks([
        { now: 0 },
        { now: 10_000, online: true },
        { now: OFFLINE_GRACE_MS },
      ]),
    ).toEqual(["none", "none", "none"]);
  });

  test("never interrupts a network being joined", () => {
    expect(
      ticks([{ now: 0 }, { connecting: true, now: OFFLINE_GRACE_MS * 2 }]),
    ).toEqual(["none", "none"]);
  });

  test("an idle hotspot steps aside so saved networks can be tried", () => {
    expect(
      ticks([
        { hotspotActive: true, now: 0 },
        { hotspotActive: true, now: HOTSPOT_IDLE_RETRY_MS },
      ]),
    ).toEqual(["none", "retry-saved-networks"]);
  });

  test("keeps the hotspot while someone is on it", () => {
    expect(
      ticks([
        { hotspotActive: true, now: 0 },
        { hotspotActive: true, now: HOTSPOT_IDLE_RETRY_MS, stations: 1 },
        { hotspotActive: true, now: HOTSPOT_IDLE_RETRY_MS * 2, stations: 1 },
      ]),
    ).toEqual(["none", "none", "none"]);
  });

  test("booth Wi-Fi chosen by staff stays up, even next to Ethernet", () => {
    expect(
      ticks([
        { holdHotspot: true, now: 0, online: true },
        {
          holdHotspot: true,
          hotspotActive: true,
          now: HOTSPOT_IDLE_RETRY_MS * 2,
        },
      ]),
    ).toEqual(["start-hotspot", "none"]);
  });
});

describe("mDNS name", () => {
  const renamed = {
    avahiName: "ditherbooth-2",
    hostname: "ditherbooth",
    lastRestartAt: null,
    now: 0,
  };

  test("reads the name out of busctl's reply", () => {
    expect(parseBusctlString('s "ditherbooth-2"\n')).toBe("ditherbooth-2");
    expect(parseBusctlString("")).toBeNull();
  });

  test("takes the name back when avahi renamed the booth", () => {
    expect(shouldReclaimMdnsName(renamed)).toBe(true);
  });

  test("leaves avahi alone when the name is right or avahi isn't running", () => {
    expect(
      shouldReclaimMdnsName({ ...renamed, avahiName: "ditherbooth" }),
    ).toBe(false);
    expect(shouldReclaimMdnsName({ ...renamed, avahiName: null })).toBe(false);
  });

  test("waits between restarts when another device really has the name", () => {
    expect(
      shouldReclaimMdnsName({
        ...renamed,
        lastRestartAt: 0,
        now: MDNS_RESTART_BACKOFF_MS - 1,
      }),
    ).toBe(false);
    expect(
      shouldReclaimMdnsName({
        ...renamed,
        lastRestartAt: 0,
        now: MDNS_RESTART_BACKOFF_MS,
      }),
    ).toBe(true);
  });
});
