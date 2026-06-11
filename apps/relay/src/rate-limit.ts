export type RateLimitDecision = {
  key: string;
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: string;
};

export class SlidingWindowRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly options: {
      limit: number;
      windowMs: number;
    }
  ) {
    if (!Number.isInteger(options.limit) || options.limit < 1) {
      throw new Error("Rate limit must be a positive integer");
    }

    if (!Number.isInteger(options.windowMs) || options.windowMs < 1000) {
      throw new Error("Rate limit window must be at least 1000ms");
    }
  }

  consume(key: string, now = new Date()): RateLimitDecision {
    const timestamp = now.getTime();
    const windowStart = timestamp - this.options.windowMs;
    const current = (this.attempts.get(key) ?? []).filter((entry) => entry > windowStart);
    const allowed = current.length < this.options.limit;

    if (allowed) {
      current.push(timestamp);
      this.attempts.set(key, current);
    } else {
      this.attempts.set(key, current);
    }

    const oldest = current[0] ?? timestamp;
    const resetAt = new Date(oldest + this.options.windowMs).toISOString();

    return {
      key,
      allowed,
      limit: this.options.limit,
      remaining: Math.max(this.options.limit - current.length, 0),
      resetAt
    };
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

export function createDevelopmentRateLimiter(env: NodeJS.ProcessEnv, prefix: string): SlidingWindowRateLimiter {
  const limit = parseExactIntegerEnv(env[`${prefix}_LIMIT`], 5, 1, `${prefix}_LIMIT`);
  const windowMs = parseExactIntegerEnv(env[`${prefix}_WINDOW_MS`], 60_000, 1000, `${prefix}_WINDOW_MS`);
  return new SlidingWindowRateLimiter({ limit, windowMs });
}

function parseExactIntegerEnv(raw: string | undefined, fallback: number, min: number, name: string): number {
  if (raw === undefined) {
    return fallback;
  }

  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be an exact positive integer`);
  }

  const value = Number.parseInt(raw, 10);
  if (value < min) {
    throw new Error(`${name} must be at least ${min}`);
  }

  return value;
}
