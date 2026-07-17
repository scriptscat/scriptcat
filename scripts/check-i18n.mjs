#!/usr/bin/env node

// Mechanical check for missing/extra translations in a locale PR.
//
// Checks:
//   1. src/locales/<locale>/*.json namespace files — every key path present in the
//      en-US reference must exist in every other locale (and vice versa for extras).
//   2. src/locales/<locale>/index.ts — must export every namespace that en-US exports.
//   3. src/assets/_locales/<locale>/messages.json — key parity against the en/ reference,
//      for locales that already have a directory (chrome.i18n store-listing strings).
//   4. docs/references/terminology-<locale>.md — every locale under src/locales MUST have one.
//      A translation PR that adds/changes a locale without its terminology file is rejected.
//   5. src/pkg/utils/monaco-editor/langs.ts — for locales that already have an `editorLangs` entry,
//      its key set must match en-US (hover prompts, script-header field prompts).
//
// Locales that only exist under src/locales but have no src/assets/_locales directory, or no
// editorLangs entry yet, are reported as a warning, not a failure — those two surfaces are
// optional/best-effort (see docs/translation.md); once a locale HAS an entry, its keys must
// stay in sync with en-US or the check fails.

import process from "node:process";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const LOCALES_DIR = path.join(ROOT, "src/locales");
const REFERENCE_LOCALE = "en-US";
const CHROME_LOCALES_DIR = path.join(ROOT, "src/assets/_locales");
const CHROME_REFERENCE_LOCALE = "en";
const TERMINOLOGY_DIR = path.join(ROOT, "docs/references");

// chrome.i18n `_locales` directories don't follow one fixed rule (some are the bare language
// subtag like "ko", others are the full region-qualified code like "zh_CN" or "pt_BR"), and a
// hardcoded i18next-locale -> chrome-dir map silently rots the moment a PR adds a directory this
// script doesn't know about yet. So resolve it by scanning what's actually on disk instead.
function findChromeDirName(locale, actualChromeDirs) {
  const [lang, region] = locale.split("-");
  const candidates = region ? [`${lang}_${region}`, lang] : [lang];
  return candidates.find((candidate) => actualChromeDirs.includes(candidate));
}

function isDir(p) {
  return existsSync(p) && statSync(p).isDirectory();
}

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function flattenKeys(obj, prefix = "", out = new Set()) {
  for (const [key, value] of Object.entries(obj)) {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenKeys(value, keyPath, out);
    } else {
      out.add(keyPath);
    }
  }
  return out;
}

function diffKeys(referenceKeys, targetKeys) {
  const missing = [...referenceKeys].filter((k) => !targetKeys.has(k)).sort();
  const extra = [...targetKeys].filter((k) => !referenceKeys.has(k)).sort();
  return { missing, extra };
}

// Find the entry point for the Monaco editor's language data, whether it's still the original
// single file or has been split into src/pkg/utils/monaco-editor/langs/<locale>.ts + index.ts
// (each locale imported into an `editorLangs` map). Support both so a refactor of this file
// doesn't make the check report a false "file missing".
function findEditorLangsEntry() {
  const splitIndex = path.join(ROOT, "src/pkg/utils/monaco-editor/langs/index.ts");
  if (existsSync(splitIndex)) return splitIndex;
  const singleFile = path.join(ROOT, "src/pkg/utils/monaco-editor/langs.ts");
  if (existsSync(singleFile)) return singleFile;
  return null;
}

function unwrapExpression(node) {
  while (node && (ts.isAsExpression(node) || ts.isParenthesizedExpression(node))) {
    node = node.expression;
  }
  return node;
}

function propName(nameNode, sourceFile) {
  if (ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode) || ts.isNumericLiteral(nameNode)) {
    return nameNode.text;
  }
  return nameNode.getText(sourceFile);
}

const moduleCache = new Map();

// Parse one TS module: its top-level `const x = {...}` object literals (for resolving
// same-file identifier references like `grantValuePrompts: grantValuePromptsEnUS`), its
// default-import bindings resolved to absolute file paths (for the split-file layout, where
// `editorLangs` maps a locale to an imported identifier), and its `export default {...}`.
function parseModule(filePath) {
  if (moduleCache.has(filePath)) return moduleCache.get(filePath);

  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const topLevelConsts = new Map();
  const imports = new Map();
  let defaultExport;

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (!decl.initializer) continue;
        const initializer = unwrapExpression(decl.initializer);
        if (ts.isObjectLiteralExpression(initializer)) {
          topLevelConsts.set(decl.name.getText(sourceFile), initializer);
        }
      }
    } else if (
      ts.isImportDeclaration(statement) &&
      statement.importClause?.name &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith(".")
    ) {
      const baseDir = path.dirname(filePath);
      const specifier = statement.moduleSpecifier.text;
      const resolved = [
        path.join(baseDir, `${specifier}.ts`),
        path.join(baseDir, `${specifier}.tsx`),
        path.join(baseDir, specifier, "index.ts"),
      ].find((candidate) => existsSync(candidate));
      if (resolved) {
        imports.set(statement.importClause.name.getText(sourceFile), resolved);
      }
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const expr = unwrapExpression(statement.expression);
      if (ts.isObjectLiteralExpression(expr)) defaultExport = expr;
    }
  }

  const moduleInfo = { sourceFile, topLevelConsts, imports, defaultExport };
  moduleCache.set(filePath, moduleInfo);
  return moduleInfo;
}

// Flatten an object-literal AST node into dot-path keys, resolving identifiers against the
// given module's own top-level consts first, then (for the split-file layout) against its
// imports — recursing into the imported module's default export with ITS OWN scope.
function flattenNode(node, prefix, out, moduleInfo) {
  node = unwrapExpression(node);
  if (ts.isObjectLiteralExpression(node)) {
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const key = propName(prop.name, moduleInfo.sourceFile);
        flattenNode(prop.initializer, prefix ? `${prefix}.${key}` : key, out, moduleInfo);
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        const key = propName(prop.name, moduleInfo.sourceFile);
        flattenNode(prop.name, prefix ? `${prefix}.${key}` : key, out, moduleInfo);
      }
    }
    return;
  }
  if (ts.isIdentifier(node)) {
    if (moduleInfo.topLevelConsts.has(node.text)) {
      flattenNode(moduleInfo.topLevelConsts.get(node.text), prefix, out, moduleInfo);
      return;
    }
    if (moduleInfo.imports.has(node.text)) {
      const importedModule = parseModule(moduleInfo.imports.get(node.text));
      if (importedModule.defaultExport) {
        flattenNode(importedModule.defaultExport, prefix, out, importedModule);
        return;
      }
    }
  }
  // Leaf: string/template literal, `.replace(...)` call, or an unresolved identifier.
  out.add(prefix);
}

// Return a Map from locale code to its flattened key set, for either layout of the Monaco
// editor's language data.
function parseEditorLangs(entryPath) {
  const moduleInfo = parseModule(entryPath);
  const editorLangsNode = moduleInfo.topLevelConsts.get("editorLangs");
  if (!editorLangsNode) {
    throw new Error(`Could not find "export const editorLangs = ..." in ${entryPath}`);
  }

  const localeMap = new Map();
  for (const prop of editorLangsNode.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const locale = propName(prop.name, moduleInfo.sourceFile);
    const keys = new Set();
    flattenNode(prop.initializer, "", keys, moduleInfo);
    localeMap.set(locale, keys);
  }
  return localeMap;
}

let hasError = false;
const problems = [];

function reportError(message) {
  hasError = true;
  problems.push({ level: "error", message });
}

function reportWarning(message) {
  problems.push({ level: "warning", message });
}

// --- 1 & 2: src/locales namespace files + index.ts exports ---

const localeDirs = readdirSync(LOCALES_DIR).filter((name) => isDir(path.join(LOCALES_DIR, name)));

if (!localeDirs.includes(REFERENCE_LOCALE)) {
  reportError(`Reference locale directory "${REFERENCE_LOCALE}" not found under src/locales.`);
} else {
  const referenceDir = path.join(LOCALES_DIR, REFERENCE_LOCALE);
  const namespaceFiles = readdirSync(referenceDir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  const otherLocales = localeDirs.filter((name) => name !== REFERENCE_LOCALE).sort();

  for (const locale of otherLocales) {
    const localeDir = path.join(LOCALES_DIR, locale);

    // index.ts must export every namespace en-US exports.
    const indexPath = path.join(localeDir, "index.ts");
    if (!existsSync(indexPath)) {
      reportError(`src/locales/${locale}/index.ts is missing.`);
    } else {
      const indexSource = readFileSync(indexPath, "utf8");
      for (const file of namespaceFiles) {
        const ns = path.basename(file, ".json");
        if (!indexSource.includes(`"./${ns}.json"`)) {
          reportError(`src/locales/${locale}/index.ts does not export namespace "${ns}" (missing "./${ns}.json").`);
        }
      }
    }

    for (const file of namespaceFiles) {
      const referenceJson = readJson(path.join(referenceDir, file));
      const referenceKeys = flattenKeys(referenceJson);

      const targetPath = path.join(localeDir, file);
      if (!existsSync(targetPath)) {
        reportError(`src/locales/${locale}/${file} is missing entirely (${referenceKeys.size} keys untranslated).`);
        continue;
      }

      const targetJson = readJson(targetPath);
      const targetKeys = flattenKeys(targetJson);
      const { missing, extra } = diffKeys(referenceKeys, targetKeys);

      if (missing.length > 0) {
        reportError(
          `src/locales/${locale}/${file} is missing ${missing.length} key(s) present in ${REFERENCE_LOCALE}:\n` +
            missing.map((k) => `    - ${k}`).join("\n")
        );
      }
      if (extra.length > 0) {
        reportError(
          `src/locales/${locale}/${file} has ${extra.length} key(s) not present in ${REFERENCE_LOCALE} (stale or misspelled key?):\n` +
            extra.map((k) => `    - ${k}`).join("\n")
        );
      }
    }
  }
}

// --- 3: src/assets/_locales/<locale>/messages.json ---

if (isDir(CHROME_LOCALES_DIR)) {
  const chromeReferencePath = path.join(CHROME_LOCALES_DIR, CHROME_REFERENCE_LOCALE, "messages.json");
  if (!existsSync(chromeReferencePath)) {
    reportError(`Reference file ${path.relative(ROOT, chromeReferencePath)} not found.`);
  } else {
    const chromeReferenceKeys = flattenKeys(readJson(chromeReferencePath));
    const actualChromeDirs = readdirSync(CHROME_LOCALES_DIR).filter((name) =>
      isDir(path.join(CHROME_LOCALES_DIR, name))
    );

    for (const locale of localeDirs) {
      if (locale === REFERENCE_LOCALE) continue;
      const chromeDirName = findChromeDirName(locale, actualChromeDirs);

      if (!chromeDirName) {
        reportWarning(
          `src/assets/_locales has no directory for locale "${locale}" yet (optional, but consider adding it — see docs/translation.md).`
        );
        continue;
      }

      const messagesPath = path.join(CHROME_LOCALES_DIR, chromeDirName, "messages.json");
      if (!existsSync(messagesPath)) {
        reportError(`src/assets/_locales/${chromeDirName}/ exists but is missing messages.json.`);
        continue;
      }

      const targetKeys = flattenKeys(readJson(messagesPath));
      const { missing, extra } = diffKeys(chromeReferenceKeys, targetKeys);

      if (missing.length > 0) {
        reportError(
          `src/assets/_locales/${chromeDirName}/messages.json is missing ${missing.length} key(s) present in ` +
            `${CHROME_REFERENCE_LOCALE}/messages.json:\n` +
            missing.map((k) => `    - ${k}`).join("\n")
        );
      }
      if (extra.length > 0) {
        reportError(
          `src/assets/_locales/${chromeDirName}/messages.json has ${extra.length} key(s) not present in ` +
            `${CHROME_REFERENCE_LOCALE}/messages.json:\n` +
            extra.map((k) => `    - ${k}`).join("\n")
        );
      }
    }
  }
}

// --- 4: docs/references/terminology-<locale>.md ---

for (const locale of localeDirs) {
  const terminologyPath = path.join(TERMINOLOGY_DIR, `terminology-${locale}.md`);
  if (!existsSync(terminologyPath)) {
    reportError(
      `docs/references/terminology-${locale}.md is missing. Every locale under src/locales/ must have a ` +
        `terminology guide — see docs/translation.md § 各语言术语规范 / Per-locale terminology.`
    );
  }
}

// --- 5: src/pkg/utils/monaco-editor/langs.ts (or the split langs/<locale>.ts + index.ts) ---

const editorLangsEntry = findEditorLangsEntry();

if (!editorLangsEntry) {
  reportError(
    `Could not find the Monaco editor's language data — neither src/pkg/utils/monaco-editor/langs.ts nor ` +
      `src/pkg/utils/monaco-editor/langs/index.ts exists.`
  );
} else {
  const editorLangsByLocale = parseEditorLangs(editorLangsEntry);
  const relPath = path.relative(ROOT, editorLangsEntry);

  if (!editorLangsByLocale.has(REFERENCE_LOCALE)) {
    reportError(`${relPath}: editorLangs has no "${REFERENCE_LOCALE}" entry to use as a reference.`);
  } else {
    const referenceKeys = editorLangsByLocale.get(REFERENCE_LOCALE);

    for (const locale of localeDirs) {
      if (locale === REFERENCE_LOCALE) continue;

      if (!editorLangsByLocale.has(locale)) {
        reportWarning(
          `${relPath}: editorLangs has no "${locale}" entry yet (${referenceKeys.size} keys untranslated for the ` +
            `Monaco editor's hover prompts; optional, but consider adding it).`
        );
        continue;
      }

      const targetKeys = editorLangsByLocale.get(locale);
      const { missing, extra } = diffKeys(referenceKeys, targetKeys);

      if (missing.length > 0) {
        reportError(
          `${relPath}: editorLangs["${locale}"] is missing ${missing.length} key(s) present in "${REFERENCE_LOCALE}":\n` +
            missing.map((k) => `    - ${k}`).join("\n")
        );
      }
      if (extra.length > 0) {
        reportError(
          `${relPath}: editorLangs["${locale}"] has ${extra.length} key(s) not present in "${REFERENCE_LOCALE}" (stale or misspelled key?):\n` +
            extra.map((k) => `    - ${k}`).join("\n")
        );
      }
    }
  }
}

// --- report ---

if (problems.length === 0) {
  console.log("✅ i18n check passed: all locales match the en-US / en reference key sets.");
  process.exit(0);
}

for (const { level, message } of problems) {
  console.error(level === "error" ? `\n❌ ${message}` : `\n⚠️  ${message}`);
}

if (hasError) {
  console.error("\ni18n check failed. Fix the missing/extra keys above before submitting the translation PR.");
  process.exit(1);
}

console.log("\n✅ i18n check passed (with warnings above).");
