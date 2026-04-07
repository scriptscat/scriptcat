// 工具调用模式检测 — 在 agent loop 中检测重复/循环调用并生成针对性提醒

export interface ToolCallRecord {
  name: string;
  args: string; // 原始 JSON
  result: string; // 工具返回的字符串
  iteration: number;
}

/**
 * 规范化参数字符串（消除 JSON 格式差异）
 */
function normalizeArgs(args: string): string {
  try {
    return JSON.stringify(JSON.parse(args));
  } catch {
    return args;
  }
}

/**
 * 判断 execute_script 的结果是否为 null（脚本没有 return）
 */
function isNullResult(result: string): boolean {
  try {
    const parsed = JSON.parse(result);
    return parsed.result === null || parsed.result === undefined;
  } catch {
    return false;
  }
}

// 不参与通用重复计数的查询类工具
const QUERY_TOOLS = new Set(["list_tasks", "list_tabs"]);

/**
 * 检测：完全相同的 tool + args 被调用2次
 */
function checkDuplicateCalls(history: ToolCallRecord[]): string | null {
  const recent = history.slice(-10);
  const seen = new Map<string, number>();

  for (const h of recent) {
    // 查询类工具频繁重复调用是正常的
    if (QUERY_TOOLS.has(h.name)) continue;
    const key = `${h.name}::${normalizeArgs(h.args)}`;
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    if (count >= 2) {
      return `[System Warning] You called \`${h.name}\` with identical arguments ${count} times. This violates the "never call the same tool with same arguments twice" rule. Change your approach or use ask_user.`;
    }
  }
  return null;
}

/**
 * 检测：execute_script 从最新往回数连续返回 null ≥ 3次
 */
function checkExecuteScriptNulls(history: ToolCallRecord[]): string | null {
  const execCalls = history.filter((h) => h.name === "execute_script");
  if (execCalls.length < 3) return null;

  let consecutiveNulls = 0;
  for (let i = execCalls.length - 1; i >= 0; i--) {
    if (isNullResult(execCalls[i].result)) {
      consecutiveNulls++;
    } else {
      break;
    }
  }

  if (consecutiveNulls >= 3) {
    return (
      `[System Warning] execute_script returned null ${consecutiveNulls} consecutive times. Common causes:\n` +
      "1. Your code lacks a `return` statement — use `return value` instead of `console.log(value)`.\n" +
      "2. Your action may have already succeeded (e.g., opened a new tab) — check with `list_tabs`.\n" +
      "3. The selectors might be wrong — re-read the page with `get_tab_content`.\n" +
      "Stop retrying the same approach. Try a completely different method, or use ask_user to get help."
    );
  }

  return null;
}

/**
 * 检测：get_tab_content 对同一 tab_id 调用 ≥ 3次
 */
function checkGetTabContentRepetition(history: ToolCallRecord[]): string | null {
  const getContentCalls = history.filter((h) => h.name === "get_tab_content");
  if (getContentCalls.length < 3) return null;

  const tabCounts = new Map<string, number>();
  for (const h of getContentCalls) {
    try {
      const args = JSON.parse(h.args);
      const tabId = String(args.tab_id || "unknown");
      tabCounts.set(tabId, (tabCounts.get(tabId) || 0) + 1);
    } catch {
      continue;
    }
  }

  for (const [, count] of tabCounts) {
    if (count >= 3) {
      return `[System Warning] You called \`get_tab_content\` ${count} times on the same tab. You already have enough page information — act on it with \`execute_script\` instead of re-reading. If you're stuck, use ask_user.`;
    }
  }

  return null;
}

/**
 * 检测：最近8条调用中同一工具出现 ≥ 5次（排除查询类工具）
 */
function checkGenericRepetition(history: ToolCallRecord[]): string | null {
  const recent = history.slice(-8);
  const toolCounts = new Map<string, number>();

  for (const h of recent) {
    if (QUERY_TOOLS.has(h.name)) continue;
    toolCounts.set(h.name, (toolCounts.get(h.name) || 0) + 1);
  }

  for (const [name, count] of toolCounts) {
    if (count >= 5) {
      return `[System Warning] You called \`${name}\` ${count} times in recent iterations without meaningful progress. You may be stuck in a loop. Stop and reassess your approach, or use ask_user to get help.`;
    }
  }

  return null;
}

/**
 * 分析工具调用历史，检测重复/循环模式并生成针对性的提醒消息。
 * 按优先级检测，命中即返回。返回 null 表示没有检测到问题。
 *
 * @param startIndex 只检测 history[startIndex:] 的记录。
 *   调用方应在每次收到警告后将 startIndex 推进到当前 history.length，
 *   避免已经警告过的旧记录持续触发同一条警告。
 */
export function detectToolCallIssues(history: ToolCallRecord[], startIndex = 0): string | null {
  const relevantHistory = startIndex > 0 ? history.slice(startIndex) : history;
  if (relevantHistory.length < 2) return null;

  // 规则1: 完全相同的 tool + args
  const duplicateWarning = checkDuplicateCalls(relevantHistory);
  if (duplicateWarning) return duplicateWarning;

  // 规则2: execute_script 连续返回 null
  const executeNullWarning = checkExecuteScriptNulls(relevantHistory);
  if (executeNullWarning) return executeNullWarning;

  // 规则3: get_tab_content 对同一 tab 重复调用
  const getContentWarning = checkGetTabContentRepetition(relevantHistory);
  if (getContentWarning) return getContentWarning;

  // 规则4: 通用重复检测（兜底）
  const genericWarning = checkGenericRepetition(relevantHistory);
  if (genericWarning) return genericWarning;

  return null;
}
