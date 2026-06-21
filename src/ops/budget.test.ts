import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadChannelDefinition } from "../config/loader.js";
import { budgetStatus, estimateChannel } from "./estimate.js";

const luz = await loadChannelDefinition(resolve(process.cwd(), "src/config/luz-es.yaml"));

function withBudget(cap: number | undefined) {
  return { ...luz, kpis: { ...luz.kpis, budget_usd_month: cap } } as typeof luz;
}

describe("budgetStatus", () => {
  it("returns none with no cap", () => {
    expect(budgetStatus(withBudget(undefined)).severity).toBe("none");
    expect(budgetStatus(withBudget(0)).severity).toBe("none");
  });

  it("flags over when estimate exceeds the cap", () => {
    const est = estimateChannel(luz).perMonthUsd;
    const s = budgetStatus(withBudget(Math.max(0.01, est / 2)));
    expect(s.severity).toBe("over");
    expect(s.pctUsed).toBeGreaterThan(1);
  });

  it("warns near the cap and is ok well under it", () => {
    const est = estimateChannel(luz).perMonthUsd;
    // Choose a cap so the estimate sits ~90% of it → warn.
    expect(budgetStatus(withBudget(est / 0.9)).severity).toBe("warn");
    // A generous cap → ok.
    expect(budgetStatus(withBudget(est * 10 + 1)).severity).toBe("ok");
  });
});
