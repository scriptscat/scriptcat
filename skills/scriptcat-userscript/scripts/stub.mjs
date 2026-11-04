#!/usr/bin/env node
// Builds a stub for iterating on a page script from a local file: the script's own header (and UserConfig block)
// plus `@require file:///<absolute path>`, with an empty body. ScriptCat re-reads a file:/// @require on every page
// load, so after installing the stub once, saving the file and reloading the page runs the new code.
//
//   node stub.mjs my-script.user.js [-o my-script.stub.user.js]
//
// Exits 2 on a usage or read error, or when the source has no // ==UserScript== header.
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

export function buildStub(source, absolutePath) {
  const end = source.match(/^[ \t]*\/\/[ \t]*==\/UserScript==[ \t]*$/m);
  if (!end || !/^[ \t]*\/\/[ \t]*==UserScript==[ \t]*$/m.test(source.slice(0, end.index))) {
    throw new Error("source has no // ==UserScript== … // ==/UserScript== header");
  }
  const header = source.slice(0, end.index);
  const parts = [`${header}// @require      ${pathToFileURL(absolutePath).href}\n${end[0]}\n`];
  // ScriptCat builds the settings form from the installed code, so the stub must carry the UserConfig block too.
  const userConfig = source.match(/\/\*\s*==UserConfig==[\s\S]+?==\/UserConfig==\s*\*\//);
  if (userConfig) parts.push(`\n${userConfig[0]}\n`);
  return parts.join("");
}

function main(args) {
  const outIndex = args.indexOf("-o");
  const out = outIndex === -1 ? undefined : args[outIndex + 1];
  const inputs = outIndex === -1 ? args : [...args.slice(0, outIndex), ...args.slice(outIndex + 2)];
  if (inputs.length !== 1 || (outIndex !== -1 && !out)) {
    console.error("usage: node stub.mjs <script.user.js> [-o <stub.user.js>]");
    return 2;
  }
  const file = path.resolve(inputs[0]);
  let stub;
  try {
    stub = buildStub(readFileSync(file, "utf8"), file);
  } catch (e) {
    console.error(`${file}: ${e.message}`);
    return 2;
  }
  if (out) writeFileSync(out, stub);
  else process.stdout.write(stub);
  return 0;
}

// realpath: the skill is usually installed through a symlink, while import.meta.url is the resolved path
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
