// Verifies the caller origin Chrome passes as an argv entry against the host's own configured
// allow-list (doc 04 §3 adversary A6; doc 05 §5 "the host additionally verifies caller origin").
// Exact string match only — no wildcards, no trailing-slash/case normalization, since Chrome
// itself never varies the format it passes.

export type OriginCheckResult = { ok: true; origin: string } | { ok: false; reason: string };

const CHROME_EXTENSION_ORIGIN_RE = /^chrome-extension:\/\/[a-p]{32}\/$/;

/**
 * Chrome native messaging passes the caller's extension origin as one of the trailing argv
 * entries (exact position isn't documented as stable, so we scan for the one that looks like a
 * chrome-extension:// origin rather than assuming a fixed index).
 */
export function extractCallerOrigin(argv: readonly string[]): string | undefined {
  return argv.find((arg) => CHROME_EXTENSION_ORIGIN_RE.test(arg));
}

export function verifyCallerOrigin(argv: readonly string[], allowedOrigins: readonly string[]): OriginCheckResult {
  const origin = extractCallerOrigin(argv);
  if (!origin) {
    return { ok: false, reason: "NO_ORIGIN_ARGUMENT" };
  }
  if (allowedOrigins.length === 0) {
    return { ok: false, reason: "NO_ALLOWED_ORIGINS_CONFIGURED" };
  }
  if (!allowedOrigins.includes(origin)) {
    return { ok: false, reason: "ORIGIN_NOT_ALLOWED" };
  }
  return { ok: true, origin };
}

/** Truncates an untrusted string to a bounded length before it's ever written to a log line. */
export function truncateForLog(value: string, maxLength = 128): string {
  return value.length > maxLength ? value.slice(0, maxLength) + "…" : value;
}
