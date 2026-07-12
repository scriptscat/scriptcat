// Token-bucket rate limiting per client: read calls, write requests, concurrent in-flight calls,
// and auth-failure lockout. Each limiter is intentionally single-purpose rather than one generic
// configurable bucket, since the limits genuinely have different units (calls per minute vs. per
// hour vs. a concurrency ceiling) — see shared/limits.ts for the actual numbers.

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/** Fixed-window counter: `limit` events per `windowMs`, keyed by an arbitrary string (clientId). */
export class WindowedRateLimiter {
  private windows = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  check(key: string, now = Date.now()): RateLimitResult {
    const entry = this.windows.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.windows.set(key, { count: 1, windowStart: now });
      return { allowed: true };
    }
    if (entry.count >= this.limit) {
      const retryAfterMs = this.windowMs - (now - entry.windowStart);
      return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
    }
    entry.count++;
    return { allowed: true };
  }

  reset(key: string): void {
    this.windows.delete(key);
  }
}

/** Tracks how many calls are currently in-flight per client; caller must release() when done. */
export class ConcurrencyLimiter {
  private inFlight = new Map<string, number>();

  constructor(private readonly limit: number) {}

  tryAcquire(key: string): boolean {
    const current = this.inFlight.get(key) ?? 0;
    if (current >= this.limit) return false;
    this.inFlight.set(key, current + 1);
    return true;
  }

  release(key: string): void {
    const current = this.inFlight.get(key) ?? 0;
    if (current <= 1) {
      this.inFlight.delete(key);
    } else {
      this.inFlight.set(key, current - 1);
    }
  }
}

/**
 * Auth-failure lockout: N failures within `windowMs` locks the endpoint out for `lockoutMs`
 * (defaults: 3 failures/minute/endpoint → 5-minute lockout, see shared/limits.ts). Keyed by
 * endpoint identity, not clientId — a failing handshake has no authenticated identity yet.
 */
export class AuthFailureLockout {
  private failures = new Map<string, number[]>();
  private lockedUntil = new Map<string, number>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
    private readonly lockoutMs: number
  ) {}

  isLockedOut(key: string, now = Date.now()): boolean {
    const until = this.lockedUntil.get(key);
    if (until === undefined) return false;
    if (now >= until) {
      this.lockedUntil.delete(key);
      return false;
    }
    return true;
  }

  recordFailure(key: string, now = Date.now()): void {
    const cutoff = now - this.windowMs;
    const recent = (this.failures.get(key) ?? []).filter((t) => t > cutoff);
    recent.push(now);
    this.failures.set(key, recent);
    if (recent.length >= this.maxFailures) {
      this.lockedUntil.set(key, now + this.lockoutMs);
    }
  }

  recordSuccess(key: string): void {
    this.failures.delete(key);
    this.lockedUntil.delete(key);
  }
}
