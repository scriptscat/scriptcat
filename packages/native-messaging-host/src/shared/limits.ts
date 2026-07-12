// Rate/size limits, bounded-configurable: these are the defaults, and `resolveLimits` below may
// narrow (never widen) them from the host's config file.
export const LIMITS = {
  socketLineMaxBytes: 4 * 1024 * 1024, // 4 MiB
  nativeMessageMaxBytes: 1024 * 1024, // 1 MiB each way (Chrome hard-caps host->browser at 1 MiB)
  rawInlineScriptMaxBytes: 512 * 1024, // must fit a host->browser frame with envelope headroom
  downloadedScriptMaxBytes: 2 * 1024 * 1024, // fetched by the extension; never transits the host
  concurrentCallsPerClient: 4,
  readCallsPerMinutePerClient: 60,
  writeRequestsPerHourPerClient: 10,
  pendingApprovalsPerClient: 5,
  pairingAttemptsPerHourGlobal: 3,
  pairingPendingPerConnection: 1,
  authFailuresPerMinutePerEndpoint: 3,
  authLockoutMs: 5 * 60_000,
  approvalTtlMs: 5 * 60_000,
  pairingTtlMs: 2 * 60_000,
  requestTimeoutMs: 30_000,
  pingIntervalMs: 20_000,
} as const;

export type Limits = typeof LIMITS;

/**
 * Merges bounded overrides from host config on top of the defaults. Every override is clamped
 * to `[1, default]` — an override can only make a limit *stricter*, never looser: a compromised
 * or misconfigured config file must not be able to relax rate limits or size caps.
 */
export function resolveLimits(overrides: Partial<Record<keyof Limits, number>> = {}): Limits {
  const resolved = { ...LIMITS };
  for (const key of Object.keys(overrides) as (keyof Limits)[]) {
    const value = overrides[key];
    const defaultValue = LIMITS[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= defaultValue) {
      (resolved as Record<keyof Limits, number>)[key] = value;
    }
  }
  return resolved;
}
