import type { IMessageQueue } from "@Packages/message/message_queue";
import type { LogLevel } from "@App/app/logger/core";
import type { Logger, LoggerDAO } from "@App/app/repo/logger";
import {
  type ScriptDAO,
  type SCRIPT_RUN_STATUS,
  SCRIPT_RUN_STATUS_ERROR,
  SCRIPT_RUN_STATUS_RUNNING,
  SCRIPT_TYPE_BACKGROUND,
  SCRIPT_TYPE_CRONTAB,
} from "@App/app/repo/scripts";
import { EXTERNAL_ACCESS_COMPONENT } from "./audit";
import { ExternalAccessBridgeError } from "./errors";
import { LIMITS, type ScriptsLogsResult, type ScriptsRunResult } from "./generated/protocol.generated";

export type LogSeverity = ScriptsLogsResult["logs"][number]["severity"];
type LogEntry = ScriptsLogsResult["logs"][number];

export const RUN_DEFAULT_TIMEOUT_MS = 60_000;
export const RUN_MAX_TIMEOUT_MS = 240_000;
export const LOGS_DEFAULT_LIMIT = 100;
export const LOGS_MAX_LIMIT = 1000;
const LOGS_DEFAULT_WINDOW_MS = 3600_000;
// 日志正文由脚本控制、单条可能很大；按条丢弃最旧记录，让整个 JSON-RPC 帧不超过 daemon 的读上限。
// 预留 64 KiB 给信封与结果中的其他字段。
const LOGS_BYTE_BUDGET = LIMITS.maxFrameBytes - 64 * 1024;

const SEVERITY_RANK: Record<LogSeverity, number> = { debug: 0, info: 1, warn: 2, error: 3 };

// ScriptService.updateRunStatus 实际发布的载荷：error 来自 sandbox，多为 { error: string }（Logger.E /
// CATRetryError），并非 TScriptRunStatus 声明的形状。
interface RunStatusMessage {
  uuid: string;
  runStatus: SCRIPT_RUN_STATUS;
  error?: unknown;
}

interface RunEnd {
  status: "complete" | "error";
  error?: string;
  endedAt: number;
}

export interface ScriptRunner {
  runScript(uuid: string): Promise<unknown>;
}

export interface ScriptLogsQuery {
  since?: number;
  severity?: LogSeverity;
  text?: string;
  limit?: number;
}

function toSeverity(level: LogLevel): LogSeverity | undefined {
  if (level === "none") return undefined;
  return level === "trace" ? "debug" : level;
}

function errorText(error: unknown): string | undefined {
  if (error === undefined || error === null) return undefined;
  if (typeof error === "string") return error;
  if (typeof error === "object" && "error" in error && typeof error.error === "string") return error.error;
  return JSON.stringify(error);
}

function toEntry(row: Logger, severity: LogSeverity): LogEntry {
  const { component, uuid: _uuid, ...rest } = row.label;
  const fields = Object.entries(rest)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ({ name, value: typeof value === "string" ? value : JSON.stringify(value) }));
  return {
    time: row.createtime,
    severity,
    message: row.message,
    ...(typeof component === "string" ? { component } : {}),
    ...(fields.length ? { fields } : {}),
  };
}

/**
 * 外部接入的 scripts.run / scripts.logs：复用编辑器「运行」通路（RuntimeService.runScript）并从
 * ScriptCat 日志读取脚本的运行记录。
 */
export class ExternalAccessRunLogs {
  constructor(
    private readonly scriptDAO: Pick<ScriptDAO, "get">,
    private readonly runner: ScriptRunner,
    private readonly mq: Pick<IMessageQueue, "subscribe">,
    private readonly loggerDAO: Pick<LoggerDAO, "queryLogs">
  ) {}

  async run(uuid: string, options: { wait: boolean; timeoutMs: number }): Promise<ScriptsRunResult> {
    const script = await this.scriptDAO.get(uuid);
    if (!script) throw new ExternalAccessBridgeError("NOT_FOUND", "script not found");
    if (script.type !== SCRIPT_TYPE_BACKGROUND && script.type !== SCRIPT_TYPE_CRONTAB) {
      throw new ExternalAccessBridgeError("INVALID_REQUEST", "only background or scheduled scripts can run");
    }
    const startedAt = Date.now();
    if (!options.wait) {
      await this.runner.runScript(uuid);
      return { status: "running", startedAt, logs: [], contentTrust: "untrusted-user-script-log" };
    }
    // 先订阅再触发，避免错过本次的 RUNNING。
    const waiter = this.waitForRunEnd(uuid, options.timeoutMs);
    try {
      await this.runner.runScript(uuid);
      const end = await waiter.ended;
      // 终态（COMPLETE/ERROR）先于 sandbox 的 "exec script complete/error" 日志发布，这条收尾日志可能
      // 尚未落库；脚本运行期间写下的日志（GM_log 等）此时已在库中。
      const { logs, truncated } = await this.queryLogs(uuid, { since: startedAt });
      if (!end) return { status: "running", startedAt, logs, truncated, contentTrust: "untrusted-user-script-log" };
      return {
        status: end.status,
        ...(end.error !== undefined ? { error: end.error } : {}),
        startedAt,
        endedAt: end.endedAt,
        logs,
        truncated,
        contentTrust: "untrusted-user-script-log",
      };
    } finally {
      waiter.dispose();
    }
  }

  async logs(uuid: string, query: ScriptLogsQuery): Promise<ScriptsLogsResult> {
    const script = await this.scriptDAO.get(uuid);
    if (!script) throw new ExternalAccessBridgeError("NOT_FOUND", "script not found");
    const { logs, truncated } = await this.queryLogs(uuid, {
      ...query,
      since: query.since ?? Date.now() - LOGS_DEFAULT_WINDOW_MS,
    });
    return { logs, truncated, contentTrust: "untrusted-user-script-log" };
  }

  /**
   * scriptRunStatus 不带运行 id：重跑时 sandbox 先为旧运行发 COMPLETE 再为本次发 RUNNING，因此只有
   * 见到本次 RUNNING 之后的第一个非 RUNNING 状态才是本次运行的终态。run-in 与当前环境不匹配时 sandbox
   * 不运行也不发 RUNNING，这种情况按超时返回 running。超时 resolve undefined。
   */
  private waitForRunEnd(uuid: string, timeoutMs: number) {
    let resolveEnd!: (end: RunEnd | undefined) => void;
    const ended = new Promise<RunEnd | undefined>((resolve) => (resolveEnd = resolve));
    let sawRunning = false;
    const unsubscribe = this.mq.subscribe<RunStatusMessage>("scriptRunStatus", (message) => {
      if (message.uuid !== uuid) return;
      if (message.runStatus === SCRIPT_RUN_STATUS_RUNNING) {
        sawRunning = true;
        return;
      }
      if (!sawRunning) return;
      if (message.runStatus === SCRIPT_RUN_STATUS_ERROR) {
        resolveEnd({ status: "error", error: errorText(message.error), endedAt: Date.now() });
      } else {
        resolveEnd({ status: "complete", endedAt: Date.now() });
      }
    });
    const timer = setTimeout(() => resolveEnd(undefined), timeoutMs);
    return {
      ended,
      dispose() {
        clearTimeout(timer);
        unsubscribe();
      },
    };
  }

  private async queryLogs(
    uuid: string,
    query: ScriptLogsQuery & { since: number }
  ): Promise<{ logs: LogEntry[]; truncated: boolean }> {
    const minRank = SEVERITY_RANK[query.severity ?? "debug"];
    const needle = query.text?.toLowerCase();
    const limit = query.limit ?? LOGS_DEFAULT_LIMIT;
    // 从最新往回取满 limit 与字节预算，再翻成 oldest first。queryLogs 只按 createtime 排序，同一毫秒内
    // 的先后要靠自增 id 区分，这里自行排序。
    const rows = (await this.loggerDAO.queryLogs(query.since, Number.MAX_SAFE_INTEGER)).sort(
      (a, b) => b.createtime - a.createtime || b.id - a.id
    );
    const newestFirst: LogEntry[] = [];
    const encoder = new TextEncoder();
    let bytes = 0;
    let truncated = false;
    for (const row of rows) {
      if (row.label.uuid !== uuid || row.label.component === EXTERNAL_ACCESS_COMPONENT) continue;
      const severity = toSeverity(row.level);
      if (!severity || SEVERITY_RANK[severity] < minRank) continue;
      if (needle !== undefined && !row.message.toLowerCase().includes(needle)) continue;
      if (newestFirst.length >= limit) {
        truncated = true;
        break;
      }
      const entry = toEntry(row, severity);
      bytes += encoder.encode(JSON.stringify(entry)).length + 1;
      if (bytes > LOGS_BYTE_BUDGET) {
        truncated = true;
        break;
      }
      newestFirst.push(entry);
    }
    return { logs: newestFirst.reverse(), truncated };
  }
}
