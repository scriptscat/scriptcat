// stdout is exclusively the native-messaging channel (host) / MCP stdio (shim) — writing a log
// line to stdout would corrupt the framed protocol stream, so all diagnostics go to stderr.
// Never logs tokens, script source, or URL credentials/query secrets.

const REDACTED = "[REDACTED]";

// Matches common secret-bearing query parameters so accidental inclusion in a logged URL never
// leaks the value, even if a caller forgets to redact it explicitly.
const SENSITIVE_QUERY_KEYS = ["token", "key", "secret", "password", "auth", "signature", "sig"];

/** Redacts query-string values for keys that commonly carry credentials, keeping the shape. */
export function redactUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return REDACTED;
  }
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEYS.some((sensitive) => key.toLowerCase().includes(sensitive))) {
      url.searchParams.set(key, REDACTED);
    }
  }
  return url.toString();
}

/** Redacts a value that must never appear in logs (tokens, credentials) regardless of context. */
export function redactSecret(_value: string): string {
  return REDACTED;
}

export type LogLevel = "trace" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

/**
 * Structured, stderr-only logger. `service` is a fixed label (e.g. "broker", "shim") carried on
 * every line so log output stays greppable without a log-aggregation pipeline.
 */
export class Logger {
  constructor(private readonly service: string) {}

  private write(level: LogLevel, message: string, fields?: LogFields): void {
    const line = {
      ts: new Date().toISOString(),
      level,
      service: this.service,
      message,
      ...fields,
    };
    process.stderr.write(JSON.stringify(line) + "\n");
  }

  trace(message: string, fields?: LogFields): void {
    this.write("trace", message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.write("info", message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.write("warn", message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.write("error", message, fields);
  }
}
