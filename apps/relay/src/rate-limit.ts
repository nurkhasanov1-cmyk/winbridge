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
  const limit = Number.parseInt(env[`${prefix}_LIMIT`] ?? "5", 10);
  const windowMs = Number.parseInt(env[`${prefix}_WINDOW_MS`] ?? "60000", 10);
  return new SlidingWindowRateLimiter({ limit, windowMs });
}
