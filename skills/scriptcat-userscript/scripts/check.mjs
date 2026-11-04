#!/usr/bin/env node
// Static checks for a ScriptCat userscript: catches the mistakes that make a script install fine and then fail at
// runtime (missing grants, @grant none misuse, bad cron expressions, …). Zero dependencies; run with Node 18+.
//
//   node check.mjs my-script.user.js [more.user.js …]
//
// Prints one line per finding — `error|warn <rule> <file>:<line> <message>` — and exits 1 when any error was found,
// 0 otherwise, 2 on a usage or read error. The rules mirror ScriptCat's runtime; the sources are named per rule.
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import process from "node:process";

// Mirror of SUPPORTED_GRANTS in src/pkg/utils/script_compat.ts; check.test.mjs fails when the two differ.
export const KNOWN_GRANTS = new Set([
  "none",
  "unsafeWindow",
  "GM_info",
  "GM.info",
  "window.onurlchange",
  "CAT.agent.conversation",
  "CAT.agent.dom",
  "CAT.agent.model",
  "CAT.agent.opfs",
  "CAT.agent.skills",
  "CAT.agent.task",
  "CAT_createBlobUrl",
  "CAT_fetchBlob",
  "CAT_fetchDocument",
  "CAT_fileStorage",
  "CAT_registerMenuInput",
  "CAT_scriptLoaded",
  "CAT_unregisterMenuInput",
  "CAT_userConfig",
  "GM.addElement",
  "GM.addStyle",
  "GM.addValueChangeListener",
  "GM.closeInTab",
  "GM.closeNotification",
  "GM.cookie",
  "GM.deleteValue",
  "GM.deleteValues",
  "GM.download",
  "GM.getResourceText",
  "GM.getResourceURL",
  "GM.getResourceUrl",
  "GM.getTab",
  "GM.getTabs",
  "GM.getValue",
  "GM.getValues",
  "GM.listValues",
  "GM.log",
  "GM.notification",
  "GM.openInTab",
  "GM.registerMenuCommand",
  "GM.removeValueChangeListener",
  "GM.saveTab",
  "GM.setClipboard",
  "GM.setValue",
  "GM.setValues",
  "GM.unregisterMenuCommand",
  "GM.updateNotification",
  "GM.xmlHttpRequest",
  "GM_addElement",
  "GM_addStyle",
  "GM_addValueChangeListener",
  "GM_closeInTab",
  "GM_closeNotification",
  "GM_cookie",
  "GM_deleteValue",
  "GM_deleteValues",
  "GM_download",
  "GM_getResourceText",
  "GM_getResourceURL",
  "GM_getTab",
  "GM_getTabs",
  "GM_getValue",
  "GM_getValues",
  "GM_listValues",
  "GM_log",
  "GM_notification",
  "GM_openInTab",
  "GM_registerMenuCommand",
  "GM_removeValueChangeListener",
  "GM_saveTab",
  "GM_setClipboard",
  "GM_setValue",
  "GM_setValues",
  "GM_unregisterMenuCommand",
  "GM_updateNotification",
  "GM_xmlhttpRequest",
  "window.close",
  "window.focus",
]);

// Same rule as getGrantCandidates (src/app/service/content/gm_api/grant.ts): only the prefix is swapped, case kept.
const candidates = (name) => {
  if (name.startsWith("GM.")) return [name, `GM_${name.slice(3)}`];
  if (name.startsWith("GM_")) return [name, `GM.${name.slice(3)}`];
  return [name];
};

// APIs injected together with another one (`depend` in src/app/service/content/gm_api/*.ts): granting the key also
// makes these exact names available. Only the exact names — their GM_/GM. counterparts are not added.
const DEPENDS = {
  "GM.getValues": ["GM_getValues"],
  "GM.addValueChangeListener": ["GM_addValueChangeListener"],
  "GM.removeValueChangeListener": ["GM_removeValueChangeListener"],
  "GM.log": ["GM_log"],
  "GM.registerMenuCommand": ["GM_registerMenuCommand"],
  CAT_registerMenuInput: ["GM_registerMenuCommand"],
  "GM.addStyle": ["GM_addStyle"],
  "GM.addElement": ["GM_addElement"],
  "GM.unregisterMenuCommand": ["GM_unregisterMenuCommand"],
  CAT_unregisterMenuInput: ["GM_unregisterMenuCommand"],
  CAT_fileStorage: ["CAT_fetchBlob"],
  GM_openInTab: ["GM_closeInTab"],
  "GM.openInTab": ["GM_openInTab", "GM_closeInTab"],
  "GM.getTab": ["GM_getTab"],
  "GM.saveTab": ["GM_saveTab"],
  "GM.getTabs": ["GM_getTabs"],
  "GM.setClipboard": ["GM_setClipboard"],
  "GM.getResourceText": ["GM_getResourceText"],
  "GM.getResourceURL": ["GM_getResourceURL"],
  "GM.getResourceUrl": ["GM_getResourceURL"],
};

// Every API name a script can call with these grants, the way createContext (create_context.ts) injects them.
function availableApis(grants) {
  const available = new Set();
  const inject = (name) => {
    if (available.has(name)) return;
    available.add(name);
    for (const dep of DEPENDS[name] ?? []) inject(dep);
  };
  for (const grant of grants) for (const c of candidates(grant)) inject(c);
  return available;
}

const RUN_AT = new Set(["document-start", "document-body", "document-end", "document-idle", "context-menu"]);
const TAB_APIS = new Set(["GM_getTab", "GM_saveTab", "GM_getTabs", "GM.getTab", "GM.saveTab", "GM.getTabs"]);
const REQUEST_APIS = ["GM_xmlhttpRequest", "GM.xmlHttpRequest", "GM_download", "GM.download"];

const lineAt = (text, index) => {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
};

// Blanks out comments, and separately string/template/regex contents, keeping every offset and newline so that line
// numbers still match the source. Template `${…}` expressions stay as code.
function lex(code) {
  const noComments = code.split("");
  const bare = code.split("");
  const strings = [];
  const blank = (arr, from, to) => {
    for (let i = from; i < to; i++) if (arr[i] !== "\n") arr[i] = " ";
  };
  let i = 0;
  let lastSignificant = "";
  const templateDepth = []; // brace depth at which each open `${` returns to its template
  let braceDepth = 0;
  const readQuoted = (quote, start) => {
    let j = start + 1;
    while (j < code.length && code[j] !== quote && code[j] !== "\n") j += code[j] === "\\" ? 2 : 1;
    return Math.min(j + 1, code.length);
  };
  const readTemplate = (start) => {
    // returns [end, endsWithExpression]
    let j = start;
    while (j < code.length) {
      if (code[j] === "\\") j += 2;
      else if (code[j] === "`") return [j + 1, false];
      else if (code[j] === "$" && code[j + 1] === "{") return [j + 2, true];
      else j++;
    }
    return [j, false];
  };
  const templatePiece = (start, from) => {
    const [end, expr] = readTemplate(from);
    strings.push({ value: code.slice(from, expr ? end - 2 : end - 1), index: from });
    blank(bare, from, expr ? end - 2 : end - 1);
    if (expr) templateDepth.push(braceDepth);
    lastSignificant = expr ? "{" : "`";
    return end;
  };
  while (i < code.length) {
    const c = code[i];
    const next = code[i + 1];
    if (c === "/" && next === "/") {
      const end = code.indexOf("\n", i) === -1 ? code.length : code.indexOf("\n", i);
      blank(noComments, i, end);
      blank(bare, i, end);
      i = end;
    } else if (c === "/" && next === "*") {
      const close = code.indexOf("*/", i + 2);
      const end = close === -1 ? code.length : close + 2;
      blank(noComments, i, end);
      blank(bare, i, end);
      i = end;
    } else if (c === '"' || c === "'") {
      const end = readQuoted(c, i);
      strings.push({ value: code.slice(i + 1, end - 1), index: i + 1 });
      blank(bare, i + 1, end - 1);
      lastSignificant = c;
      i = end;
    } else if (c === "`") {
      i = templatePiece(i, i + 1);
    } else if (c === "}" && templateDepth.length && templateDepth[templateDepth.length - 1] === braceDepth) {
      templateDepth.pop();
      i = templatePiece(i, i + 1);
    } else if (c === "/" && (lastSignificant === "" || /[(,=:[!&|?{};+\-*%<>~^]/.test(lastSignificant))) {
      let j = i + 1;
      let inClass = false;
      while (j < code.length && code[j] !== "\n") {
        if (code[j] === "\\") j += 2;
        else if (code[j] === "[") ((inClass = true), j++);
        else if (code[j] === "]") ((inClass = false), j++);
        else if (code[j] === "/" && !inClass) break;
        else j++;
      }
      blank(bare, i + 1, j);
      lastSignificant = "/";
      i = j + 1;
    } else {
      if (c === "{") braceDepth++;
      else if (c === "}") braceDepth--;
      if (!/\s/.test(c)) lastSignificant = /[\w$)\]]/.test(c) ? "a" : c;
      i++;
    }
  }
  return { noComments: noComments.join(""), bare: bare.join(""), strings };
}

function parseHeader(code) {
  const start = code.match(/^[ \t]*\/\/[ \t]*==UserScript==[ \t]*$/m);
  const end = code.match(/^[ \t]*\/\/[ \t]*==\/UserScript==[ \t]*$/m);
  if (!start || !end || end.index < start.index) return null;
  const meta = new Map();
  const lines = code.slice(0, end.index).split("\n");
  const firstLine = lineAt(code, start.index);
  for (let n = firstLine; n <= lines.length; n++) {
    const m = lines[n - 1].match(/^\s*\/\/\s*@(\S+)(?:\s+(.*?))?\s*$/);
    if (!m) continue;
    const tag = m[1].toLowerCase();
    if (!meta.has(tag)) meta.set(tag, []);
    meta.get(tag).push({ value: m[2] ?? "", line: n });
  }
  return { meta, firstLine, bodyStart: end.index + end[0].length };
}

const hostOf = (pattern) => {
  if (pattern === "<all_urls>") return "*";
  const m = pattern.match(/^[^:/]*:\/\/([^/:]*)/);
  return m ? m[1].toLowerCase() : null;
};

// Same matching as getConnectMatched (src/app/service/service_worker/gm_api/gm_api.ts): a request to the page's own
// host needs nothing; otherwise an @connect entry must equal the host or a parent domain of it, be `*`, or be `self`
// with the host under the page's domain. The page host is approximated from @match/@include.
function connectCovers(host, connects, pageHosts) {
  const under = (h, d) => `.${h}`.endsWith(`.${d}`);
  for (const page of pageHosts) {
    if (page === "*") continue;
    if (page.startsWith("*.") ? under(host, page.slice(2)) : host === page) return true;
  }
  for (const c of connects) {
    if (c === "*") return true;
    if (c === "self") {
      if (pageHosts.some((p) => p !== "*" && under(host, p.replace(/^\*\./, "")))) return true;
    } else if (under(host, c)) return true;
  }
  return false;
}

function cronProblem(expr) {
  if (/\s{2,}/.test(expr)) return "separate the fields with single spaces (ScriptCat splits on one space)";
  const parts = expr.trim().split(" ");
  if (parts.length !== 5 && parts.length !== 6) return `expected 5 fields (or 6 with seconds), found ${parts.length}`;
  let onces = 0;
  for (const part of parts) {
    if (part.startsWith("once")) {
      onces++;
      if (!/^once(\([^()\s]+\))?$/.test(part)) return `"${part}" is not "once" or "once(<values>)"`;
    } else if (!/^[\w*,/-]+$/.test(part)) {
      return `"${part}" is not a valid cron field`;
    }
  }
  if (onces > 1) return "only one field may use once";
  return null;
}

export function checkScript(code) {
  const findings = [];
  const add = (level, rule, line, message) => findings.push({ level, rule, line, message });
  const header = parseHeader(code);
  if (!header) {
    add("error", "header-missing", 1, "no // ==UserScript== … // ==/UserScript== block");
    return findings;
  }
  const { meta, firstLine, bodyStart } = header;
  const values = (tag) => (meta.get(tag) ?? []).map((e) => e.value);

  if (!meta.has("name")) add("error", "name-missing", firstLine, "@name is required");
  if (!meta.has("namespace"))
    add("warn", "namespace-missing", firstLine, "@name + @namespace identify the script; set both");

  const isBackground = meta.has("background") || meta.has("crontab");
  const grants = meta.get("grant") ?? [];
  const grantSet = new Set(grants.map((g) => g.value));
  const grantNone = grantSet.has("none");
  const available = availableApis(grantSet);

  for (const g of grants) {
    if (g.value === "none") {
      if (grants.some((o) => o.value !== "none")) {
        add("error", "grant-none-conflict", g.line, "@grant none cannot be combined with other grants");
      }
    } else if (!candidates(g.value).some((c) => KNOWN_GRANTS.has(c))) {
      add("warn", "grant-unknown", g.line, `ScriptCat does not implement "${g.value}"; this grant has no effect`);
    }
  }

  if (!isBackground && !meta.has("match") && !meta.has("include")) {
    add("error", "match-missing", firstLine, "a page script needs @match or @include, or it never runs");
  }

  const runAts = meta.get("run-at") ?? [];
  runAts.forEach((r, i) => {
    if (i > 0) add("warn", "run-at-invalid", r.line, "only the first @run-at is used");
    else if (!RUN_AT.has(r.value))
      add("warn", "run-at-invalid", r.line, `unknown @run-at "${r.value}"; falls back to document-idle`);
  });
  for (const e of meta.get("early-start") ?? []) {
    if (runAts[0]?.value !== "document-start") {
      add("warn", "early-start-ignored", e.line, "@early-start only takes effect with @run-at document-start");
    }
  }

  const crons = meta.get("crontab") ?? [];
  crons.forEach((c, i) => {
    const problem = cronProblem(c.value);
    if (problem) add("error", "cron-invalid", c.line, `@crontab "${c.value}": ${problem}`);
    if (i > 0) {
      add("warn", "cron-multiple", c.line, "every @crontab line is scheduled and one bad line stops all; write one");
    }
  });

  const body = code.slice(bodyStart);
  const bodyLine = (index) => lineAt(code, bodyStart + index);
  const { noComments, bare, strings } = lex(body);

  const used = [];
  const usage = /(?<![\w$.])(GM_[A-Za-z]\w*|GM\.[A-Za-z]\w*|CAT_[A-Za-z]\w*|CAT\.agent\.\w+)/g;
  for (const m of bare.matchAll(usage)) {
    if (m[1] === "GM_info" || m[1] === "GM.info") continue;
    used.push({ name: m[1], index: m.index });
  }
  for (const m of noComments.matchAll(/(?<![\w$])onurlchange\b|addEventListener\(\s*["'`]urlchange["'`]/g)) {
    used.push({ name: "window.onurlchange", index: m.index });
  }
  used.sort((a, b) => a.index - b.index);

  const definedInBody = new Set(
    [...bare.matchAll(/(?:function|const|let|var|class)\s+(GM_\w+|CAT_\w+)/g)].map((m) => m[1])
  );
  const reported = new Set();
  for (const u of used) {
    const key = `${u.name}`;
    if (reported.has(key) || definedInBody.has(u.name)) continue;
    const known = candidates(u.name).some((c) => KNOWN_GRANTS.has(c));
    if (!known) {
      reported.add(key);
      add(
        "warn",
        "api-unsupported",
        bodyLine(u.index),
        `${u.name} is not a ScriptCat API (fine if a @require'd library defines it)`
      );
      continue;
    }
    if (isBackground && TAB_APIS.has(u.name)) {
      reported.add(key);
      add("error", "background-tab-api", bodyLine(u.index), `${u.name} is not available in background scripts`);
      continue;
    }
    if (grantNone) {
      reported.add(key);
      add("error", "grant-none-api", bodyLine(u.index), `${u.name} does not exist under @grant none`);
      continue;
    }
    if (!available.has(u.name)) {
      reported.add(key);
      add("error", "grant-missing", bodyLine(u.index), `${u.name} is used but not granted; add "// @grant ${u.name}"`);
    }
  }

  if (grantNone) {
    const m = bare.match(/(?<![\w$.])unsafeWindow\b/);
    if (m)
      add(
        "error",
        "grant-none-unsafewindow",
        bodyLine(m.index),
        "unsafeWindow does not exist under @grant none; use window"
      );
  }

  if (isBackground && !hasTopLevelReturn(bare)) {
    add(
      "warn",
      "background-no-return",
      firstLine,
      "no top-level return: the run is complete as soon as the body's synchronous part ends"
    );
  }

  if (used.some((u) => REQUEST_APIS.includes(u.name))) {
    const connects = values("connect").map((c) => c.toLowerCase());
    const pageHosts = isBackground ? [] : [...values("match"), ...values("include")].map(hostOf).filter(Boolean);
    const seen = new Set();
    for (const s of strings) {
      const m = s.value.match(/^https?:\/\/([^/:?#]+)/i);
      if (!m) continue;
      const host = m[1].toLowerCase();
      if (seen.has(host) || connectCovers(host, connects, pageHosts)) continue;
      seen.add(host);
      add(
        "warn",
        "connect-missing",
        bodyLine(s.index),
        `requests to ${host} prompt the user; add "// @connect ${host}" if the script requests it`
      );
    }
  }

  return findings.sort((a, b) => a.line - b.line);
}

function hasTopLevelReturn(bare) {
  let depth = 0;
  for (let i = 0; i < bare.length; i++) {
    const c = bare[i];
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
    else if (
      depth === 0 &&
      bare.startsWith("return", i) &&
      !/[\w$]/.test(bare[i - 1] ?? "") &&
      !/[\w$]/.test(bare[i + 6] ?? "")
    ) {
      return true;
    }
  }
  return false;
}

function main(files) {
  if (!files.length) {
    console.error("usage: node check.mjs <script.user.js> [more.user.js …]");
    return 2;
  }
  let status = 0;
  for (const file of files) {
    let code;
    try {
      code = readFileSync(file, "utf8");
    } catch (e) {
      console.error(`cannot read ${file}: ${e.message}`);
      return 2;
    }
    const findings = checkScript(code);
    for (const f of findings) console.log(`${f.level} ${f.rule} ${file}:${f.line} ${f.message}`);
    if (!findings.length) console.log(`ok ${file}`);
    if (findings.some((f) => f.level === "error")) status = 1;
  }
  return status;
}

// realpath: the skill is usually installed through a symlink, while import.meta.url is the resolved path
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
