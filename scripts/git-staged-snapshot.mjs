#!/usr/bin/env node

// Materialize the Git index's staged content into `destDir`, bypassing any unstaged
// working-tree edits (and any working-tree files not yet staged at all). Used so a
// content check can validate what's about to be committed, not whatever happens to be on
// disk — staging a bad file and then reverting the working copy to a good one (or the
// reverse) must not fool the check.
//
// `git checkout-index` reads straight from the index, so this touches neither the working
// tree nor the index itself.

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

export function materializeStagedSnapshot(repoRoot, destDir) {
  mkdirSync(destDir, { recursive: true });
  const prefix = destDir.endsWith(path.sep) ? destDir : destDir + path.sep;
  execFileSync("git", ["checkout-index", "-a", "-f", `--prefix=${prefix}`], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [repoRoot, destDir] = process.argv.slice(2);
  if (!repoRoot || !destDir) {
    console.error("Usage: git-staged-snapshot.mjs <repoRoot> <destDir>");
    process.exit(1);
  }
  materializeStagedSnapshot(path.resolve(repoRoot), path.resolve(destDir));
}
