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
import type { TExtensionEnv } from "@App/app/service/extension/extension_env";
import { backgroundRunInAllowed } from "@App/app/service/sandbox/utils";
import { getCombinedMeta } from "../utils";
import { EXTERNAL_ACCESS_COMPONENT } from "./audit";
import { ExternalAccessBridgeError } from "./errors";
import { LIMITS, type ScriptsLogsResult, type ScriptsRunResult } from "./generated/protocol.generated";

export type LogSeverity = ScriptsLogsResult["logs"][number]["severity"];
type LogEntry = ScriptsLogsResult["logs"][number];

export const RUN_DEFAULT_TIMEOUT_MS = 60_000;
export const RUN_MAX_TIMEOUT_MS = 240_000;
const LOGS_DEFAULT_LIMIT = 100;
export const LOGS_MAX_LIMIT = 1000;
const LOGS_DEFAULT_WINDOW_MS = 3600_000;
// 日志正文由脚本控制、单条可能很大；按条丢弃最旧记录，让整个 JSON-RPC 帧不超过 daemon 的读上限。
// 预留 64 KiB 给信封与结果中的其他字段。
const LOGS_BYTE_BUDGET = LIMITS.maxFrameBytes - 64 * 1024;
// 运行的错误信息同样由脚本控制（throw 任意长度的文本）；截到这么多 UTF-16 单元，剩余预算留给日志。
const RUN_ERROR_MAX_LENGTH = 16 * 1024;

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

export interface ScriptRunOptions {
  wait: boolean;
  timeoutMs: number;
  // 调用被 $/cancelRequest 取消或连接断开。
  signal?: AbortSignal;
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

const UNENCODABLE = "[unencodable]";

/**
 * 把脚本可控的值编码成文本。日志标签经结构化克隆落库，可能含 BigInt（后台脚本 return 1n）或循环引用
 * （抛出的非 Error 对象原样记录），JSON.stringify 会对它们抛错；这里 BigInt 取十进制文本，其余无法编码的
 * 换成固定占位，一条日志编码不了不能让整次查询失败。
 */
function encodeValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();
  try {
    return (
      JSON.stringify(value, (_key, nested) => (typeof nested === "bigint" ? nested.toString() : nested)) ?? UNENCODABLE
    );
  } catch {
    return UNENCODABLE;
  }
}

function errorText(error: unknown): string | undefined {
  if (error === undefined || error === null) return undefined;
  if (typeof error === "object" && "error" in error && typeof error.error === "string") return error.error;
  return encodeValue(error);
}

function truncateError(text: string): string {
  if (text.length <= RUN_ERROR_MAX_LENGTH) return text;
  let end = RUN_ERROR_MAX_LENGTH;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end--;
  return `${text.slice(0, end)}…`;
}

const encoder = new TextEncoder();

function jsonBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).length;
}

function toEntry(row: Logger, severity: LogSeverity): LogEntry {
  const { component, uuid: _uuid, ...rest } = row.label;
  const fields = Object.entries(rest)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ({ name, value: encodeValue(value) }));
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
    private readonly loggerDAO: Pick<LoggerDAO, "walkNewestFirst">,
    // 本 SW 的扩展环境，即 sandbox 判断 @run-in 时拿到的同一份（经 offscreen 的 getExtensionEnv 转发）。
    private readonly extensionEnv: TExtensionEnv
  ) {}

  /**
   * 每个脚本最近一次外部触发的「已开始」信号：见到它的 RUNNING、它的等待结束或它被放弃时兑现。
   * scriptRunStatus 不带运行 id，同一脚本的两次外部运行若同时在等，后一次会把前一次的 RUNNING 当成自己的，
   * 再把前一次被停止时的 COMPLETE 当成本次终态；所以下一次等待型外部运行要等这个信号后才订阅并触发。这只覆盖外部运行之间的交错：编辑器
   * 「运行」或 cron 恰好与外部运行交错时仍可能误判，根治需要 sandbox 在运行状态里带上运行 id。
   */
  private readonly lastStart = new Map<string, Promise<void>>();

  async run(uuid: string, options: ScriptRunOptions): Promise<ScriptsRunResult> {
    // 一个截止时间从收到请求起算，覆盖排队与等待；取消同样结束这两段。
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), options.timeoutMs);
    const onCancel = () => stop.abort();
    options.signal?.addEventListener("abort", onCancel, { once: true });
    const release = () => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onCancel);
    };
    const stopped = new Promise<void>((resolve) => stop.signal.addEventListener("abort", () => resolve()));
    let detached = false;
    try {
      const script = await this.scriptDAO.get(uuid);
      if (!script) throw new ExternalAccessBridgeError("NOT_FOUND", "script not found");
      if (script.type !== SCRIPT_TYPE_BACKGROUND && script.type !== SCRIPT_TYPE_CRONTAB) {
        throw new ExternalAccessBridgeError("INVALID_REQUEST", "only background or scheduled scripts can run");
      }
      // sandbox 拿到的是合并了用户自定义元数据的 ScriptRunResource.metadata（buildScriptRunResourceBasic）。
      if (!backgroundRunInAllowed(getCombinedMeta(script.metadata, script.selfMetadata), this.extensionEnv)) {
        const context = this.extensionEnv.inIncognitoContext ? "incognito" : "normal";
        throw new ExternalAccessBridgeError(
          "INVALID_REQUEST",
          `script @run-in does not match this ScriptCat's ${context} context, so ScriptCat would not run it`
        );
      }
      // wait=false 不排队；但仍登记自己的开始信号，让随后的等待型运行排在它之后。
      const previous = options.wait ? this.lastStart.get(uuid) : undefined;
      let markStarted!: () => void;
      const started = new Promise<void>((resolve) => (markStarted = resolve));
      this.lastStart.set(uuid, started);
      void started.then(() => {
        if (this.lastStart.get(uuid) === started) this.lastStart.delete(uuid);
      });
      if (previous) await Promise.race([previous, stopped]);
      if (options.signal?.aborted) {
        markStarted();
        throw new ExternalAccessBridgeError("OPERATION_EXPIRED", "run canceled before it was triggered");
      }

      const startedAt = Date.now();
      // 先订阅再触发，避免错过本次的 RUNNING。排队已耗尽截止时间时照样触发，随即按超时返回 running。
      const waiter = this.waitForRunEnd(uuid, stopped, markStarted);
      try {
        await this.runner.runScript(uuid);
      } catch (e) {
        waiter.dispose();
        throw e;
      }
      if (!options.wait) {
        // 不等终态，但订阅与截止计时保留到本次 RUNNING 到达（或截止），让随后的外部运行不会认错 RUNNING。
        detached = true;
        void started.then(() => {
          waiter.dispose();
          release();
        });
        return { status: "running", startedAt, logs: [], contentTrust: "untrusted-user-script-log" };
      }
      try {
        const end = await waiter.ended;
        // 调用方已离开，运行在 ScriptCat 中继续；这个应答无人接收，不再查日志。
        if (options.signal?.aborted) {
          return { status: "running", startedAt, logs: [], contentTrust: "untrusted-user-script-log" };
        }
        const error = end?.error === undefined ? undefined : truncateError(end.error);
        // 终态（COMPLETE/ERROR）先于 sandbox 的 "exec script complete/error" 日志发布，这条收尾日志可能
        // 尚未落库；脚本运行期间写下的日志（GM_log 等）此时已在库中。
        const { logs, truncated } = await this.queryLogs(
          uuid,
          { since: startedAt },
          LOGS_BYTE_BUDGET - (error === undefined ? 0 : jsonBytes(error))
        );
        if (!end) return { status: "running", startedAt, logs, truncated, contentTrust: "untrusted-user-script-log" };
        return {
          status: end.status,
          ...(error !== undefined ? { error } : {}),
          startedAt,
          endedAt: end.endedAt,
          logs,
          truncated,
          contentTrust: "untrusted-user-script-log",
        };
      } finally {
        waiter.dispose();
      }
    } finally {
      if (!detached) release();
    }
  }

  async logs(uuid: string, query: ScriptLogsQuery): Promise<ScriptsLogsResult> {
    const script = await this.scriptDAO.get(uuid);
    if (!script) throw new ExternalAccessBridgeError("NOT_FOUND", "script not found");
    const { logs, truncated } = await this.queryLogs(
      uuid,
      { ...query, since: query.since ?? Date.now() - LOGS_DEFAULT_WINDOW_MS },
      LOGS_BYTE_BUDGET
    );
    return { logs, truncated, contentTrust: "untrusted-user-script-log" };
  }

  /**
   * scriptRunStatus 不带运行 id：重跑时 sandbox 的 stopScript 先为旧运行发 COMPLETE，再为本次发 RUNNING；
   * 被停止的旧运行之后才结束时不再发布任何状态（Runtime.execScript 只让当前运行发布终态）。因此见到本次
   * RUNNING 之后的第一个非 RUNNING 状态就是本次运行的终态。stopped（截止或取消）时 resolve undefined。
   * 见到 RUNNING、结束或 dispose 时调用 onStarted。
   */
  private waitForRunEnd(uuid: string, stopped: Promise<void>, onStarted: () => void) {
    let resolveEnd!: (end: RunEnd | undefined) => void;
    const ended = new Promise<RunEnd | undefined>((resolve) => (resolveEnd = resolve));
    void ended.then(onStarted);
    void stopped.then(() => resolveEnd(undefined));
    let sawRunning = false;
    const unsubscribe = this.mq.subscribe<RunStatusMessage>("scriptRunStatus", (message) => {
      if (message.uuid !== uuid) return;
      if (message.runStatus === SCRIPT_RUN_STATUS_RUNNING) {
        sawRunning = true;
        onStarted();
        return;
      }
      if (!sawRunning) return;
      if (message.runStatus === SCRIPT_RUN_STATUS_ERROR) {
        resolveEnd({ status: "error", error: errorText(message.error), endedAt: Date.now() });
      } else {
        resolveEnd({ status: "complete", endedAt: Date.now() });
      }
    });
    return {
      ended,
      dispose() {
        unsubscribe();
        onStarted();
      },
    };
  }

  private async queryLogs(
    uuid: string,
    query: ScriptLogsQuery & { since: number },
    byteBudget: number
  ): Promise<{ logs: LogEntry[]; truncated: boolean }> {
    const minRank = SEVERITY_RANK[query.severity ?? "debug"];
    const needle = query.text?.toLowerCase();
    const limit = query.limit ?? LOGS_DEFAULT_LIMIT;
    // 从最新往回取满 limit 与字节预算即停，再翻成 oldest first。
    const newestFirst: LogEntry[] = [];
    let bytes = 0;
    let truncated = false;
    await this.loggerDAO.walkNewestFirst(query.since, (row) => {
      if (row.label.uuid !== uuid || row.label.component === EXTERNAL_ACCESS_COMPONENT) return true;
      const severity = toSeverity(row.level);
      if (!severity || SEVERITY_RANK[severity] < minRank) return true;
      if (needle !== undefined && !row.message.toLowerCase().includes(needle)) return true;
      if (newestFirst.length >= limit) {
        truncated = true;
        return false;
      }
      const entry = toEntry(row, severity);
      bytes += jsonBytes(entry) + 1;
      if (bytes > byteBudget) {
        truncated = true;
        return false;
      }
      newestFirst.push(entry);
      return true;
    });
    return { logs: newestFirst.reverse(), truncated };
  }
}
