import { describe, expect, it } from "vitest";
import { parseSchedule, nextRuns } from "./schedule.js";

describe("parseSchedule", () => {
  it("parses HH:mm as a daily trigger", () => {
    expect(parseSchedule("07:30")).toEqual({ minutes: [30], hours: [7], daysOfWeek: [] });
  });

  it("parses a 5-field cron with ranges, lists and steps", () => {
    const p = parseSchedule("0 9,21 * * 1-5")!;
    expect(p.minutes).toEqual([0]);
    expect(p.hours).toEqual([9, 21]);
    expect(p.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns null for junk", () => {
    expect(parseSchedule("nonsense")).toBeNull();
    expect(parseSchedule(undefined)).toBeNull();
  });
});

describe("nextRuns", () => {
  it("lists the next daily occurrences", () => {
    const from = new Date("2026-06-21T06:00:00Z");
    const runs = nextRuns("07:30", from, 3);
    expect(runs).toEqual(["2026-06-21T07:30Z", "2026-06-22T07:30Z", "2026-06-23T07:30Z"]);
  });

  it("respects the same-day past time (rolls to tomorrow)", () => {
    const from = new Date("2026-06-21T08:00:00Z");
    expect(nextRuns("07:30", from, 1)[0]).toBe("2026-06-22T07:30Z");
  });

  it("honors weekday restrictions from cron", () => {
    // 2026-06-21 is a Sunday; first weekday run is Monday the 22nd.
    const from = new Date("2026-06-21T00:00:00Z");
    const runs = nextRuns("0 9 * * 1-5", from, 2);
    expect(runs[0]).toBe("2026-06-22T09:00Z");
    expect(runs[1]).toBe("2026-06-23T09:00Z");
  });

  it("returns [] when unparseable", () => {
    expect(nextRuns("???", new Date(), 3)).toEqual([]);
  });
});
