#!/usr/bin/env node

import process from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import YAML from "yaml";

const validateAll = process.argv.includes("--all");

const gitArgs = validateAll
  ? ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "*.yaml", "*.yml"]
  : ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"];

const output = execFileSync("git", gitArgs, { encoding: "utf8" });

const files = output
  .split("\0")
  .map((file) => file.trim())
  .filter((file) => /\.(ya?ml)$/i.test(file))
  .filter((file) => existsSync(file));

if (files.length === 0) {
  console.log(validateAll ? "✅ No YAML files to validate." : "✅ No staged YAML files to validate.");
  process.exit(0);
}

let hasError = false;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const docs = YAML.parseAllDocuments(source, {
    prettyErrors: true,
    strict: true,
  });

  const errors = docs.flatMap((doc) => doc.errors);

  if (errors.length > 0) {
    hasError = true;
    console.error(`\n❌ Invalid YAML: ${file}`);

    for (const error of errors) {
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
