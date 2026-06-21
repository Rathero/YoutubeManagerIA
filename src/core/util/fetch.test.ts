import { describe, expect, it } from "vitest";
import { isRetryable, resilientFetch } from "./fetch.js";

function resp(status: number): Response {
  return new Response(status === 200 ? "ok" : "err", { status });
}

describe("resilientFetch", () => {
  it("classifies retryable statuses", () => {
    expect(isRetryable(429)).toBe(true);
    expect(isRetryable(503)).toBe(true);
    expect(isRetryable(200)).toBe(false);
    expect(isRetryable(404)).toBe(false);
  });

  it("retries on 429 then succeeds", async () => {
    let calls = 0;
    const res = await resilientFetch("http://x", undefined, {
      baseMs: 1,
      fetchImpl: async () => { calls++; return resp(calls < 3 ? 429 : 200); },
    });
    expect(res.status).toBe(200);
    expect(calls).toBe(3);
  });

  it("gives up after the retry cap and returns the last response", async () => {
    let calls = 0;
    const res = await resilientFetch("http://x", undefined, {
      retries: 2, baseMs: 1,
      fetchImpl: async () => { calls++; return resp(500); },
    });
    expect(res.status).toBe(500);
    expect(calls).toBe(3); // initial + 2 retries
  });

  it("does not retry non-retryable statuses", async () => {
    let calls = 0;
    await resilientFetch("http://x", undefined, { baseMs: 1, fetchImpl: async () => { calls++; return resp(404); } });
    expect(calls).toBe(1);
  });
});
