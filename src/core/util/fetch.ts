/** Status codes worth retrying (rate limit + transient server errors). */
export function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export interface RetryOpts {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  /** Injectable fetch for testing. */
  fetchImpl?: typeof fetch;
}

function backoff(attempt: number, baseMs: number, maxMs: number): number {
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(exp / 2 + Math.random() * (exp / 2)); // full-ish jitter
}

/**
 * fetch with exponential backoff + jitter on 429/5xx and network errors, honoring
 * Retry-After. Keeps provider calls resilient under rate limits without extra deps.
 */
export async function resilientFetch(
  url: string,
  init?: RequestInit,
  opts: RetryOpts = {},
): Promise<Response> {
  const f = opts.fetchImpl ?? fetch;
  const retries = opts.retries ?? Number(process.env.FACTORY_HTTP_RETRIES ?? 3);
  const baseMs = opts.baseMs ?? 800;
  const maxMs = opts.maxMs ?? 20000;
  let attempt = 0;
  for (;;) {
    let res: Response;
    try {
      res = await f(url, init);
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, backoff(attempt, baseMs, maxMs)));
      attempt++;
      continue;
    }
    if (!isRetryable(res.status) || attempt >= retries) return res;
    const ra = Number(res.headers.get("retry-after"));
    const delay = Number.isFinite(ra) && ra > 0 ? ra * 1000 : backoff(attempt, baseMs, maxMs);
    await new Promise((r) => setTimeout(r, delay));
    attempt++;
  }
}
