import { sha256OfText } from "@App/pkg/utils/crypto";
import type { ScriptDAO, ScriptCodeDAO } from "@App/app/repo/scripts";
import { ExternalAccessBridgeError } from "./errors";
import type { ScriptSource, ScriptSourceGrepMatch, ScriptSourceGrepResult } from "./types";

// Chrome hard-caps native-messaging frames at 1 MiB host->browser; 2 MiB is the extension-local
// cap on how much source a disclosure read will return in one call. Measured against the returned
// slice (design §4.1), not the underlying file, so a line window can be pulled out of an
// oversized script while a full read keeps behaving exactly as before.
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

export interface SlicedLines {
  code: string;
  startLine: number;
  endLine: number;
  totalLines: number;
}

/**
 * The half of the line-window validation that doesn't need the file. Split out of `sliceLines` so
 * the bridge can reject a malformed window while accepting the request, instead of creating a
 * pending operation and opening a confirm page for a request that can never be served.
 */
export function assertLineWindow(startLine?: number, endLine?: number): void {
  if (startLine === undefined && endLine === undefined) return;
  if (startLine === undefined || endLine === undefined) {
    throw new ExternalAccessBridgeError("INVALID_REQUEST", "startLine and endLine must be given together");
  }
  // NaN slips through every comparison below and ends up in the reported window; a fraction makes
  // the reported window disagree with the lines Array.slice actually returns.
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
    throw new ExternalAccessBridgeError("INVALID_REQUEST", "startLine and endLine must be integers");
  }
  if (startLine < 1) {
    throw new ExternalAccessBridgeError("INVALID_REQUEST", "startLine must be >= 1");
  }
  if (endLine < startLine) {
    throw new ExternalAccessBridgeError("INVALID_REQUEST", "endLine must be >= startLine");
  }
}

/**
 * Pure line-window slicer for `scripts.source.get`'s optional startLine/endLine (design §4.1).
 * Lines are defined as `code.split("\n")` — join("\n") round-trips exactly, so a CRLF file's `\r`
 * stays at the end of its line. 1-based, inclusive, both-or-neither. No window at all returns the
 * whole file as the [1, totalLines] window.
 */
export function sliceLines(code: string, startLine?: number, endLine?: number): SlicedLines {
  assertLineWindow(startLine, endLine);
  const lines = code.split("\n");
  const totalLines = lines.length;

  if (startLine === undefined || endLine === undefined) {
    return { code, startLine: 1, endLine: totalLines, totalLines };
  }
  if (startLine > totalLines) {
    throw new ExternalAccessBridgeError("INVALID_REQUEST", "startLine exceeds the script's total line count");
  }
  // endLine past the end truncates silently (design §4.1) — pagination clients don't have to know
  // totalLines up front.
  const clampedEnd = Math.min(endLine, totalLines);
  return { code: lines.slice(startLine - 1, clampedEnd).join("\n"), startLine, endLine: clampedEnd, totalLines };
}

/**
 * Reads and formats a script's source for a disclosure response. Shared by the bridge's
 * already-allowed fast path (client holds a permanent grant) and the approval service's
 * blocking-approval path, so both return the byte-for-byte identical ScriptSource shape.
 */
export async function readScriptSource(
  scriptDAO: Pick<ScriptDAO, "get">,
  scriptCodeDAO: Pick<ScriptCodeDAO, "get">,
  uuid: string,
  startLine?: number,
  endLine?: number,
  maxBytes?: number
): Promise<ScriptSource> {
  const script = await scriptDAO.get(uuid);
  if (!script) throw new ExternalAccessBridgeError("NOT_FOUND", "script not found");
  const scriptCode = await scriptCodeDAO.get(uuid);
  if (!scriptCode) throw new ExternalAccessBridgeError("NOT_FOUND", "script source not found");
  const sliced = sliceLines(scriptCode.code, startLine, endLine);
  const sourceBytes = new TextEncoder().encode(sliced.code).length;
  if (sourceBytes > MAX_SOURCE_BYTES) {
    throw new ExternalAccessBridgeError("PAYLOAD_TOO_LARGE", "script source exceeds 2 MiB");
  }
  if (startLine === undefined && maxBytes !== undefined && sourceBytes > maxBytes) {
    throw new ExternalAccessBridgeError(
      "PAYLOAD_TOO_LARGE",
      `complete source is ${sourceBytes} bytes, exceeding the MCP response budget of ${maxBytes} bytes; use grep to locate relevant code, then read it with startLine/endLine`
    );
  }
  return {
    uuid: script.uuid,
    name: script.name,
    version: script.metadata.version?.[0],
    code: sliced.code,
    // Whole-file hash even for a window (design §4.1) — lets a client paginating through a script
    // detect the underlying file changing across reads. It never covers the window's edit surface.
    sha256: sha256OfText(scriptCode.code),
    contentTrust: "untrusted-user-script-source",
    startLine: sliced.startLine,
    endLine: sliced.endLine,
    totalLines: sliced.totalLines,
  };
}

// Regex execution budget (design §3 决策 14 / §4.2): re-checked every GREP_BUDGET_CHECK_LINES lines
// against an injectable clock so a pathological pattern can't hang the service worker — the SW is
// the whole extension's message bus — and so tests never depend on real elapsed time.
const GREP_BUDGET_MS = 2000;
const GREP_BUDGET_CHECK_LINES = 1000;

const EDIT_BUDGET_MS = 2000;

export interface GrepOptions {
  mode?: "text" | "regex";
  ignoreCase?: boolean;
  contextLines?: number;
  maxMatches?: number;
}

export interface GrepLinesResult {
  matches: ScriptSourceGrepMatch[];
  totalMatches: number;
  truncated: boolean;
  skippedLongLines: number;
  totalLines: number;
}

// Compiling the user's pattern is itself a validation step, so acceptance-time checking and the
// actual scan share it rather than each spelling out their own try/catch.
function compileGrepPattern(query: string, mode: "text" | "regex", ignoreCase: boolean): RegExp | undefined {
  if (mode !== "regex") return undefined;
  try {
    return new RegExp(query, ignoreCase ? "i" : "");
  } catch {
    throw new ExternalAccessBridgeError("INVALID_REQUEST", "invalid regular expression");
  }
}

/**
 * Everything about a grep request that can be judged without reading the script, split out of
 * `grepLines` for the same reason as `assertLineWindow`: under the "approval" source policy the
 * scan only runs after a human decision, so a request that will always fail has to be rejected up
 * front rather than after the user approves a disclosure. Out-of-range values error out, they are
 * never clamped (design §4.2).
 */
export function assertGrepParams(query: string, options: GrepOptions = {}): void {
  const contextLines = options.contextLines ?? 0;
  const maxMatches = options.maxMatches ?? 50;
  if (query.length < 1) {
    throw new ExternalAccessBridgeError("INVALID_REQUEST", "query must not be empty");
  }
  // Integer check first: NaN compares false against both bounds, and would then turn the caps into
  // their opposites — a NaN contextLines makes Array.slice hand back every line before the hit, a
  // NaN maxMatches drops every match while still reporting truncated: true.
  if (!Number.isInteger(contextLines) || contextLines < 0 || contextLines > 10) {
    throw new ExternalAccessBridgeError("INVALID_REQUEST", "contextLines must be an integer between 0 and 10");
  }
  if (!Number.isInteger(maxMatches) || maxMatches < 1 || maxMatches > 200) {
    throw new ExternalAccessBridgeError("INVALID_REQUEST", "maxMatches must be an integer between 1 and 200");
  }
  compileGrepPattern(query, options.mode ?? "text", options.ignoreCase ?? false);
}

/**
 * Pure line-by-line search for `scripts.source.grep` (design §4.2). Deliberately does not call
 * `stringMatching` (src/pkg/utils/utils.ts) or share any code with the script-list page's search
 * (design §3 决策 15): `text` mode is a plain literal substring test — none of `*`/`?`/`.` carry
 * special meaning — and `regex` mode is a real RegExp, so the two searches no longer share any
 * matching semantics to keep in sync.
 *
 * `clock` defaults to Date.now and is only ever overridden by tests, so the execution-budget abort
 * path can be exercised without actually waiting out (or triggering) a slow match.
 */
export function grepLines(
  code: string,
  query: string,
  options: GrepOptions = {},
  clock: () => number = Date.now
): GrepLinesResult {
  const mode = options.mode ?? "text";
  const ignoreCase = options.ignoreCase ?? false;
  const contextLines = options.contextLines ?? 0;
  const maxMatches = options.maxMatches ?? 50;

  assertGrepParams(query, options);

  const pattern = compileGrepPattern(query, mode, ignoreCase);
  const literalNeedle = ignoreCase ? query.toLowerCase() : query;

  const lines = code.split("\n");
  const totalLines = lines.length;
  const matches: ScriptSourceGrepMatch[] = [];
  let totalMatches = 0;
  const skippedLongLines = 0;
  const startedAt = clock();

  for (let i = 0; i < totalLines; i++) {
    if (mode === "regex") {
      if ((i + 1) % GREP_BUDGET_CHECK_LINES === 0 && clock() - startedAt > GREP_BUDGET_MS) {
        throw new ExternalAccessBridgeError("INVALID_REQUEST", "pattern too slow to execute, simplify it");
      }
    }

    const line = lines[i];

    const hit = pattern ? pattern.test(line) : (ignoreCase ? line.toLowerCase() : line).includes(literalNeedle);
    if (!hit) continue;

    totalMatches++;
    if (matches.length < maxMatches) {
      matches.push({
        lineNumber: i + 1,
        line,
        before: lines.slice(Math.max(0, i - contextLines), i),
        after: lines.slice(i + 1, i + 1 + contextLines),
      });
    }
  }

  return { matches, totalMatches, truncated: totalMatches > matches.length, skippedLongLines, totalLines };
}

/**
 * Runs `grepLines` against a script's stored source and shapes the result as the
 * `scripts.source.grep` wire response. Mirrors `readScriptSource`'s two callers (bridge's
 * already-allowed fast path and the approval service's blocking-approval path).
 */
export async function grepScriptSource(
  scriptDAO: Pick<ScriptDAO, "get">,
  scriptCodeDAO: Pick<ScriptCodeDAO, "get">,
  uuid: string,
  query: string,
  options: GrepOptions = {}
): Promise<ScriptSourceGrepResult> {
  const script = await scriptDAO.get(uuid);
  if (!script) throw new ExternalAccessBridgeError("NOT_FOUND", "script not found");
  const scriptCode = await scriptCodeDAO.get(uuid);
  if (!scriptCode) throw new ExternalAccessBridgeError("NOT_FOUND", "script source not found");

  const result = grepLines(scriptCode.code, query, options);
  return {
    uuid: script.uuid,
    name: script.name,
    version: script.metadata.version?.[0],
    matches: result.matches,
    totalMatches: result.totalMatches,
    truncated: result.truncated,
    skippedLongLines: result.skippedLongLines,
    totalLines: result.totalLines,
    sha256: sha256OfText(scriptCode.code),
    contentTrust: "untrusted-user-script-source",
  };
}

export interface TextEdit {
  oldText: string;
  newText: string;
  replaceAll?: boolean;
}

// Counts candidate positions, not non-overlapping replacements: advancing by needle.length would
// report `"aa"` in `"aaa"` as a single occurrence and let the uniqueness rule pass on an anchor that
// matches at two offsets — silently editing the first one, which content anchoring exists to prevent.
// Self-overlapping anchors are ordinary in source: a blank-line block ("\n\n"), an indent ("  "),
// a run of brackets ("))").
function countOccurrences(text: string, needle: string): number {
  let count = 0;
  for (let index = text.indexOf(needle); index !== -1; index = text.indexOf(needle, index + 1)) {
    count++;
  }
  return count;
}

// Hand-rolled rather than String.prototype.replace(All): those expand `$&` / `$1` / `$$` in the
// replacement even when the pattern is a plain string, and `$&` is an ordinary literal in a
// userscript — expansion would silently store code the client never asked for.
function replaceOccurrences(text: string, needle: string, replacement: string, all: boolean): string {
  let result = "";
  let from = 0;
  while (true) {
    const index = text.indexOf(needle, from);
    if (index === -1) break;
    result += text.slice(from, index) + replacement;
    from = index + needle.length;
    if (!all) break;
  }
  return result + text.slice(from);
}

/**
 * Content-anchored editing for `scripts.edit.request` (design §5, 决策 1-4). Edits apply in order,
 * each to the previous one's result, and uniqueness is re-checked against that intermediate text —
 * so an anchor an earlier edit duplicated is caught rather than silently resolved to the first hit.
 * `newText: ""` deletes; both fields are plain strings, never patterns.
 *
 * Throws INVALID_REQUEST — with distinguishable "not found" / "not unique" messages so an agent can
 * tell a wrong anchor from one needing more context — instead of applying part of the batch:
 * nothing here mutates anything, the result is what the human will later review on the install page.
 */
export function applyTextEdits(code: string, edits: TextEdit[], clock: () => number = Date.now): string {
  let text = code;
  const startedAt = clock();
  for (const [i, edit] of edits.entries()) {
    // Each edit scans and rebuilds the whole (up to 2 MiB) script, so cost is edits × length and a
    // small payload buys a long stall — this runs synchronously in the service worker, the whole
    // extension's message bus, at request-accept time under both write policies. Symmetric with the
    // grep budget above; the clock is injectable for the same reason.
    if (clock() - startedAt > EDIT_BUDGET_MS) {
      throw new ExternalAccessBridgeError("INVALID_REQUEST", "edits too slow to apply, send fewer or smaller edits");
    }
    if (edit.oldText.length === 0) {
      throw new ExternalAccessBridgeError("INVALID_REQUEST", `edits[${i}].oldText must not be empty`);
    }
    const occurrences = countOccurrences(text, edit.oldText);
    if (occurrences === 0) {
      throw new ExternalAccessBridgeError("INVALID_REQUEST", `edits[${i}].oldText not found in the script`);
    }
    if (occurrences > 1 && edit.replaceAll !== true) {
      throw new ExternalAccessBridgeError(
        "INVALID_REQUEST",
        `edits[${i}].oldText is not unique (${occurrences} occurrences), add surrounding context or set replaceAll`
      );
    }
    text = replaceOccurrences(text, edit.oldText, edit.newText, edit.replaceAll === true);
  }
  if (text === code) {
    throw new ExternalAccessBridgeError("INVALID_REQUEST", "edits produce no change to the script");
  }
  return text;
}
