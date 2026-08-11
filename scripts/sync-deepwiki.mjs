import { mkdtemp, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const DEFAULT_ENDPOINT = "https://mcp.deepwiki.com/mcp";
export const DEFAULT_REPOSITORY = "scriptscat/scriptcat";
export const DEFAULT_OUTPUT = ".deepwiki";

const PAGE_HEADER = /^# Page: (.+?)\r?$/gm;
const PAGE_NUMBER = /^(\d+(?:\.\d+)*)$/;
const REPOSITORY_PATH = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const EXPECTED_TOOLS = ["read_wiki_structure", "read_wiki_contents"];

function pageSlug(title) {
  const slug = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "page";
}

function pageFilename(number, title) {
  return `${number.replaceAll(".", "-")}-${pageSlug(title)}.md`;
}

export function parseWikiStructure(structure) {
  const entries = [];
  const numbers = new Set();
  const titles = new Set();

  for (const line of structure.split(/\r?\n/)) {
    const match = line.match(/^\s*-\s+(\d+(?:\.\d+)*)\s+(.+?)\s*$/);
    if (!match) continue;

    const [, number, title] = match;
    if (numbers.has(number)) throw new Error(`Duplicate DeepWiki page number: ${number}`);
    if (titles.has(title)) throw new Error(`Duplicate DeepWiki page title: ${title}`);

    numbers.add(number);
    titles.add(title);
    entries.push({ number, title, filename: pageFilename(number, title) });
  }

  if (entries.length === 0) throw new Error("DeepWiki structure contains no numbered pages");
  return entries;
}

export function parseWikiPages(contents) {
  const headers = [...contents.matchAll(PAGE_HEADER)];
  if (headers.length === 0) throw new Error("DeepWiki contents contains no '# Page:' sections");
  const titles = new Set();

  return headers.map((header, index) => {
    const title = header[1].trim();
    if (titles.has(title)) throw new Error(`Duplicate DeepWiki contents page title: ${title}`);
    titles.add(title);
    const start = header.index + header[0].length;
    const end = headers[index + 1]?.index ?? contents.length;
    const body = contents
      .slice(start, end)
      .replace(/^\r?\n+/, "")
      .trim();
    if (!body) throw new Error(`DeepWiki contents page is empty: ${title}`);
    return { title, body };
  });
}

function resolveRepositoryPath(source, repositoryFiles) {
  if (!repositoryFiles || repositoryFiles.has(source)) return source;

  const candidates = [];
  if (source.endsWith("/index.ts")) candidates.push(`${source.slice(0, -"/index.ts".length)}.ts`);
  if (source.endsWith("/index.tsx")) candidates.push(`${source.slice(0, -"/index.tsx".length)}.tsx`);
  if (source.endsWith(".tsx")) candidates.push(`${source.slice(0, -".tsx".length)}.ts`);
  if (source.endsWith(".jsx")) candidates.push(`${source.slice(0, -".jsx".length)}.js`);

  return candidates.find((candidate) => repositoryFiles.has(candidate)) ?? source;
}

function rewriteSourceReferences(line, repositoryFiles) {
  return line.replace(/\[\[?([^\]\n]+?)\]\]?\(\)/g, (match, rawLabel) => {
    const label = rawLabel.trim();
    const lineMatch = label.match(/^(.+?):([\d,\-\s]+)$/);
    const source = resolveRepositoryPath((lineMatch?.[1] ?? label).trim(), repositoryFiles);
    if (!REPOSITORY_PATH.test(source)) return match;

    const lineRange = lineMatch?.[2].trim();
    const fragment = lineRange && /^\d+(?:-\d+)?$/.test(lineRange) ? `#L${lineRange.replace("-", "-L")}` : "";
    const resolvedLabel = lineMatch ? `${source}:${lineRange}` : source;
    return `[${resolvedLabel}](../${source}${fragment})`;
  });
}

function rewriteTarget(target, pageByNumber) {
  const hash = target.indexOf("#");
  const pathname = hash === -1 ? target : target.slice(0, hash);
  const fragment = hash === -1 ? "" : target.slice(hash);
  const pageNumber = pathname || (fragment.startsWith("#") ? fragment.slice(1) : "");

  if (PAGE_NUMBER.test(pageNumber) && pageByNumber.has(pageNumber)) {
    return `./${pageByNumber.get(pageNumber)}${pathname ? fragment : ""}`;
  }

  if (
    pathname === "" ||
    pathname.startsWith("./") ||
    pathname.startsWith("../") ||
    pathname.startsWith("/") ||
    /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(pathname)
  ) {
    return target;
  }

  if (REPOSITORY_PATH.test(pathname)) return `../${pathname}${fragment}`;
  return target;
}

function pageTargetFromLabel(label, pageByNumber, pageByTitle) {
  const parenthesized = label.match(/\((\d+(?:\.\d+)?)\)/);
  const prefixed = label.match(/^\s*(\d+(?:\.\d+)?)(?:\.|\s)/);
  const number = parenthesized?.[1] ?? prefixed?.[1];
  if (number && pageByNumber.has(number)) return `./${pageByNumber.get(number)}`;
  return pageByTitle?.has(label.trim()) ? `./${pageByTitle.get(label.trim())}` : null;
}

function mapMarkdownLines(markdown, transform) {
  let fence = null;
  return markdown
    .split("\n")
    .map((line) => {
      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
      if (fence) {
        if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
          fence = null;
        }
        return line;
      }
      if (fenceMatch) {
        fence = fenceMatch[1];
        return line;
      }
      return transform(line);
    })
    .join("\n");
}

export function rewriteMarkdownLinks(markdown, pageByNumber, pageByTitle, repositoryFiles) {
  return mapMarkdownLines(markdown, (line) => {
    const withSources = rewriteSourceReferences(line, repositoryFiles);
    return withSources.replace(/\[([^\]\n]+)\]\(([^)\n]*)\)/g, (match, label, destination) => {
      if (!destination) {
        const pageTarget = pageTargetFromLabel(label, pageByNumber, pageByTitle);
        return pageTarget ? `[${label}](${pageTarget})` : match;
      }
      const destinationMatch = destination.match(/^(\S+)([\s\S]*)$/);
      if (!destinationMatch) return match;
      const [, target, suffix] = destinationMatch;
      return `[${label}](${rewriteTarget(target, pageByNumber)}${suffix})`;
    });
  });
}

export function markdownLinks(markdown) {
  const links = [];
  mapMarkdownLines(markdown, (line) => {
    for (const match of line.matchAll(/\[[^\]\n]+\]\(([^)\n]*)\)/g)) {
      const destination = match[1].trim();
      links.push(destination ? destination.split(/\s+/, 1)[0] : "");
    }
    return line;
  });
  return links;
}

function stripFragment(target) {
  return target.split(/[?#]/, 1)[0];
}

export function validateSnapshot(files) {
  if (!files.has("index.md") || !files.get("index.md")?.trim()) {
    throw new Error("Generated DeepWiki snapshot is missing a non-empty index.md");
  }

  const invalid = [];
  for (const [filename, content] of files) {
    for (const target of markdownLinks(content)) {
      if (!target) {
        invalid.push(`${filename}: empty destination`);
        continue;
      }
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) continue;
      if (target.startsWith("#")) {
        if (PAGE_NUMBER.test(target.slice(1))) invalid.push(`${filename}: ${target}`);
        continue;
      }

      const targetPath = stripFragment(target);
      if (targetPath.startsWith("./")) {
        const resolved = path.posix.normalize(targetPath.slice(2));
        if (!files.has(resolved)) invalid.push(`${filename}: ${target}`);
        continue;
      }

      if (targetPath.startsWith("../")) {
        if (!REPOSITORY_PATH.test(targetPath.slice(3))) {
          invalid.push(`${filename}: ${target}`);
        }
        continue;
      }

      invalid.push(`${filename}: ${target}`);
    }
  }

  if (invalid.length > 0) throw new Error(`DeepWiki snapshot contains invalid links:\n${invalid.join("\n")}`);
}

export function buildSnapshot(structure, contents, { repositoryFiles } = {}) {
  const entries = parseWikiStructure(structure);
  const pages = parseWikiPages(contents);
  const pageByTitle = new Map(pages.map((page) => [page.title, page]));
  const pageByNumber = new Map(entries.map((entry) => [entry.number, entry.filename]));
  const pageFilenameByTitle = new Map(entries.map((entry) => [entry.title, entry.filename]));
  const files = new Map();

  const unknownPages = pages.filter((page) => !entries.some((entry) => entry.title === page.title));
  const missingPages = entries.filter((entry) => !pages.some((page) => page.title === entry.title));
  const responseProblems = [];
  if (unknownPages.length > 0) {
    responseProblems.push(`contents pages absent from structure: ${unknownPages.map((page) => page.title).join(", ")}`);
  }
  if (pages.length !== entries.length) {
    responseProblems.push(
      `structure/content page count mismatch: ${entries.length} structure entries, ${pages.length} contents pages`
    );
  }
  if (missingPages.length > 0) {
    responseProblems.push(
      `contents pages missing from structure: ${missingPages.map((page) => page.title).join(", ")}`
    );
  }
  if (responseProblems.length > 0) {
    throw new Error(`DeepWiki response validation failed:\n- ${responseProblems.join("\n- ")}`);
  }

  for (const entry of entries) {
    const page = pageByTitle.get(entry.title);
    files.set(
      entry.filename,
      `${rewriteMarkdownLinks(page.body, pageByNumber, pageFilenameByTitle, repositoryFiles).trim()}\n`
    );
  }

  const index = [
    "# DeepWiki context",
    "",
    "Generated from the public DeepWiki MCP server. Use the smallest relevant page; current repository code and owned documentation remain authoritative.",
    "",
  ];
  for (const entry of entries) {
    const depth = entry.number.split(".").length - 1;
    index.push(`${"  ".repeat(depth)}- [${entry.number} ${entry.title}](./${entry.filename})`);
  }
  files.set("index.md", `${index.join("\n")}\n`);

  validateSnapshot(files);
  return files;
}

export async function writeSnapshot(files, outputDirectory) {
  const parent = path.dirname(outputDirectory);
  await mkdir(parent, { recursive: true });
  const transaction = await mkdtemp(path.join(parent, `${path.basename(outputDirectory)}.transaction-`));
  const staged = path.join(transaction, "new");
  const backup = path.join(transaction, "old");
  await mkdir(staged, { recursive: true });

  try {
    for (const [filename, content] of files) {
      const destination = path.join(staged, filename);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content, "utf8");
    }

    let hadPrevious = false;
    try {
      await rename(outputDirectory, backup);
      hadPrevious = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    try {
      await rename(staged, outputDirectory);
    } catch (error) {
      if (hadPrevious) await rename(backup, outputDirectory);
      throw error;
    }

    if (hadPrevious) await rm(backup, { recursive: true, force: true });
  } finally {
    await rm(transaction, { recursive: true, force: true });
  }
}

function snapshotReport(structure, contents, files, repository, endpoint) {
  const entries = parseWikiStructure(structure);
  const pages = parseWikiPages(contents);
  const pageFiles = [...files.keys()].filter((filename) => filename !== "index.md");
  const indexPageFiles = markdownLinks(files.get("index.md")).filter((target) => target.startsWith("./"));

  return {
    endpoint,
    repository,
    structureEntries: entries,
    contentPageTitles: pages.map((page) => page.title),
    writtenPageFiles: pageFiles,
    indexPageFiles,
  };
}

async function writeReport(report, reportPath) {
  if (!reportPath) return;
  const destination = path.resolve(reportPath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function collectRepositoryFiles(directory, root = directory, files = new Set()) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".deepwiki", ".git", "node_modules"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectRepositoryFiles(absolute, root, files);
    } else if (entry.isFile()) {
      files.add(path.relative(root, absolute).split(path.sep).join("/"));
    }
  }
  return files;
}

export function parseArguments(argv) {
  const args = { endpoint: DEFAULT_ENDPOINT, repository: DEFAULT_REPOSITORY, output: DEFAULT_OUTPUT, report: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--") || index + 1 >= argv.length) throw new Error(`Invalid argument: ${argument}`);
    const key = argument.slice(2);
    if (!(key in args)) throw new Error(`Unknown argument: ${argument}`);
    args[key] = argv[index + 1];
    index += 1;
  }
  return args;
}

function parseRpcResponse(body) {
  const eventData = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter(Boolean);
  const payloads = eventData.length > 0 ? eventData : [body.trim()];
  for (const payload of payloads) {
    if (!payload) continue;
    const message = JSON.parse(payload);
    if (message.error) throw new Error(`DeepWiki MCP error ${message.error.code}: ${message.error.message}`);
    if (message.result) return message.result;
  }
  throw new Error("DeepWiki MCP response did not contain a JSON-RPC result");
}

async function mcpRequest(endpoint, request, session) {
  const headers = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "Mcp-Method": request.method,
  };
  if (session.id) headers["Mcp-Session-Id"] = session.id;
  if (session.protocolVersion) headers["Mcp-Protocol-Version"] = session.protocolVersion;
  if (request.method === "tools/call" && request.params?.name) headers["Mcp-Name"] = request.params.name;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });
  const sessionId = response.headers.get("mcp-session-id");
  if (sessionId) session.id = sessionId;
  if (!response.ok) throw new Error(`DeepWiki MCP HTTP ${response.status}: ${await response.text()}`);
  return parseRpcResponse(await response.text());
}

async function mcpNotification(endpoint, notification, session) {
  const headers = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "Mcp-Method": notification.method,
  };
  if (session.id) headers["Mcp-Session-Id"] = session.id;
  if (session.protocolVersion) headers["Mcp-Protocol-Version"] = session.protocolVersion;
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(notification),
  });
  if (!response.ok) throw new Error(`DeepWiki MCP notification HTTP ${response.status}: ${await response.text()}`);
}

function resultText(result, toolName) {
  if (result.isError) {
    const detail = result.content?.find((item) => item.type === "text")?.text ?? "unknown tool error";
    throw new Error(`${toolName} returned an MCP tool error: ${detail}`);
  }
  const text = result.structuredContent?.result ?? result.content?.find((item) => item.type === "text")?.text;
  if (typeof text !== "string" || !text.trim()) throw new Error(`${toolName} returned empty content`);
  return text;
}

async function fetchWiki(endpoint, repository) {
  const session = {};
  const initialized = await mcpRequest(
    endpoint,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "scriptcat-deepwiki-sync", version: "1.0.0" },
      },
    },
    session
  );
  if (!initialized.serverInfo?.name) throw new Error("DeepWiki MCP initialize response is missing serverInfo");
  if (!initialized.protocolVersion) throw new Error("DeepWiki MCP initialize response is missing protocolVersion");
  session.protocolVersion = initialized.protocolVersion;

  await mcpNotification(endpoint, { jsonrpc: "2.0", method: "notifications/initialized", params: {} }, session);

  const tools = await mcpRequest(endpoint, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, session);
  const availableTools = new Set(tools.tools?.map((tool) => tool.name));
  for (const tool of EXPECTED_TOOLS) {
    if (!availableTools.has(tool)) throw new Error(`DeepWiki MCP does not expose ${tool}`);
  }

  const structure = await mcpRequest(
    endpoint,
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "read_wiki_structure", arguments: { repoName: repository } },
    },
    session
  );
  const contents = await mcpRequest(
    endpoint,
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "read_wiki_contents", arguments: { repoName: repository } },
    },
    session
  );

  return {
    structure: resultText(structure, "read_wiki_structure"),
    contents: resultText(contents, "read_wiki_contents"),
  };
}

export async function main(argv = process.argv.slice(2)) {
  const { endpoint, repository, output, report } = parseArguments(argv);
  const { structure, contents } = await fetchWiki(endpoint, repository);
  const repositoryFiles = await collectRepositoryFiles(process.cwd());
  const files = buildSnapshot(structure, contents, { repositoryFiles });
  await writeSnapshot(files, path.resolve(output));
  await writeReport(snapshotReport(structure, contents, files, repository, endpoint), report);
  console.log(`DeepWiki snapshot written to ${output} (${files.size} files).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
