#!/usr/bin/env node

import process from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import YAML from "yaml";

const output = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], { encoding: "utf8" });

const files = output
  .split(/\r?\n/)
  .map((file) => file.trim())
  .filter((file) => /\.(ya?ml)$/i.test(file))
  .filter((file) => existsSync(file));

if (files.length === 0) {
  console.log("✅ No staged YAML files to validate.");
  process.exit(0);
}

let hasError = false;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const doc = YAML.parseDocument(source, {
    prettyErrors: true,
    strict: true,
  });

  if (doc.errors.length > 0) {
    hasError = true;
    console.error(`\n❌ Invalid YAML: ${file}`);
    for (const error of doc.errors) {
      console.error(String(error));
    }
  } else {
    console.log(`✅ Valid YAML: ${file}`);
  }
}

if (hasError) {
  console.error("\nYAML validation failed. Please fix the files above.");
  process.exit(1);
}

console.log("\n✅ YAML validation passed.");
