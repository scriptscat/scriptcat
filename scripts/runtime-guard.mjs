import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

const ZERO_SHA = /^0{40}$/;
const PNPM = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const fullGuardPaths = [
  /^\.github\/workflows\//,
  /^\.husky\//,
  /^e2e\//,
  /^packages\//,
  /^rspack-plugins\//,
  /^scripts\//,
  /^src\//,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^playwright\.config\./,
  /^rspack\.config\./,
  /^tsconfig(?:\..+)?\.json$/,
];

const fastGuardPaths = [/^tests\//, /^vitest\.config\./, /\.test\.[cm]?[jt]sx?$/];

export function isDocumentationPath(filePath) {
  return (
    filePath === "LICENSE" ||
    filePath === ".github/pull_request_template.md" ||
    filePath.startsWith(".github/ISSUE_TEMPLATE/") ||
    filePath.startsWith("docs/") ||
    /\.(?:md|mdx|txt)$/.test(filePath)
  );
}

function matchesAny(filePath, patterns) {
  return patterns.some((pattern) => pattern.test(filePath));
}

export function classifyChangedPaths(paths) {
  const changedPaths = [...new Set(paths)].filter(Boolean);
  if (changedPaths.length === 0 || changedPaths.every(isDocumentationPath)) return "skip";
  if (
    changedPaths.some(
      (filePath) =>
        matchesAny(filePath, fullGuardPaths) && (filePath.startsWith("e2e/") || !matchesAny(filePath, fastGuardPaths))
    )
  ) {
    return "full";
  }
  if (changedPaths.every((filePath) => matchesAny(filePath, fastGuardPaths))) return "fast";
  return "full";
}

export function parsePrePushRefs(input) {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const refs = lines.map((line) => line.split(/\s+/));
  if (refs.some((fields) => fields.length !== 4 || fields.some((field) => !field))) {
    throw new Error("invalid pre-push ref input");
  }
  return refs.map(([localRef, localSha, remoteRef, remoteSha]) => ({ localRef, localSha, remoteRef, remoteSha }));
}

function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message ?? ((result.stderr ?? "").trim() || `git ${args.join(" ")} failed`));
  }
  return result.stdout;
}

function pushedPaths(refs) {
  const paths = [];
  for (const { localSha, remoteSha } of refs) {
    if (ZERO_SHA.test(localSha)) continue;
    if (ZERO_SHA.test(remoteSha)) return { paths: [], reason: "new branch" };
    paths.push(...runGit(["diff", "--name-only", "--no-renames", remoteSha, localSha]).split(/\r?\n/));
  }
  return { paths: [...new Set(paths.filter(Boolean))] };
}

function workingTreePaths() {
  return [
    ...runGit(["diff", "--name-only"]),
    ...runGit(["diff", "--cached", "--name-only"]),
    ...runGit(["ls-files", "--others", "--exclude-standard"]),
  ]
    .flatMap((output) => output.split(/\r?\n/))
    .filter(Boolean);
}

function runPnpm(args) {
  const result = spawnSync(PNPM, args, { stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

export function main(input = readFileSync(0, "utf8")) {
  let refs;
  let pushed;
  try {
    refs = parsePrePushRefs(input);
    pushed = refs.length === 0 ? { paths: [], reason: "missing pre-push ref input" } : pushedPaths(refs);
  } catch (error) {
    console.error(`Runtime guard could not classify pushed paths: ${error.message}`);
    console.error("Running the full runtime guard.");
    return runPnpm(["run", "guard:runtime"]);
  }

  const classification = pushed.reason ? "full" : classifyChangedPaths(pushed.paths);
  if (classification === "skip") {
    console.log("⏭ Runtime guard skipped: pushed changes are documentation-only or empty.");
    return 0;
  }

  if (classification !== "skip") {
    const dirtyRelevantPaths = [...new Set(workingTreePaths())].filter((filePath) => !isDocumentationPath(filePath));
    if (dirtyRelevantPaths.length > 0) {
      console.error("Runtime guard refused: relevant working-tree changes are not included in the pushed commits:");
      dirtyRelevantPaths.forEach((filePath) => console.error(`  ${filePath}`));
      return 1;
    }
  }

  if (classification === "fast") {
    console.log("🔍 Runtime guard: running static checks for test-only changes.");
    return runPnpm(["run", "guard:runtime:static"]);
  }

  console.log("🔍 Runtime guard: running the full build and runtime smoke test.");
  return runPnpm(["run", "guard:runtime"]);
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entrypoint && import.meta.url === entrypoint) {
  process.exitCode = main();
}
