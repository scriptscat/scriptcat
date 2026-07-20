#!/usr/bin/env node

// Mechanical check for missing/extra translations in a locale PR.
//
// Fail-closed by design: every surface below either verifies a concrete, statically-resolvable
// match, or hard-fails with a specific reason. None of the checks silently pass on structures
// they can't parse (spreads, computed keys, `satisfies`, syntax errors, unregistered locales,
// namespace/property shapes the evaluator doesn't recognize) — anything it can't statically
// verify is reported as an error asking a human to extend the check, never passed through.
//
// Checks:
//   0. src/locales/locales.ts — every directory under src/locales/ must be `import * as X`'d
//      and spread into `resources` under its own locale code, and the top-level `NS` array
//      must match the namespace files under src/locales/en-US/ exactly (no unregistered
//      directory, no stale/missing namespace).
//   1. src/locales/<locale>/*.json namespace files — every key path present in the
//      en-US reference must exist in every other locale (and vice versa for extras).
//   2. src/locales/<locale>/index.ts — its real `export ... from "./<ns>.json"` declarations
//      (parsed via the TS compiler, not string-matched) must cover every namespace en-US exports.
//   3. src/assets/_locales/<locale>/messages.json — key parity against the en/ reference.
//      Every locale under src/locales/ must have a chrome.i18n directory (store-listing
//      strings); a missing directory is a failure, not a warning.
//   4. docs/references/terminology-<locale>.md — every locale under src/locales MUST have one.
//      A translation PR that adds/changes a locale without its terminology file is rejected.
//   5. src/pkg/utils/monaco-editor/langs.ts (or the split langs/<locale>.ts + index.ts) — every
//      locale under src/locales/ must have an `editorLangs` entry, and its key set must match
//      en-US (hover prompts, script-header field prompts). A missing entry is a failure.
//
// Run with `--root=<path>` to check a different tree than this file's repo checkout — used by
// .husky/pre-commit to validate the Git *staged* snapshot rather than the working tree.

import process from "node:process";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// chrome.i18n `_locales` directories don't follow one fixed rule (some are the bare language
// subtag like "ko", others are the full region-qualified code like "zh_CN" or "pt_BR"), and a
// hardcoded i18next-locale -> chrome-dir map silently rots the moment a PR adds a directory this
// script doesn't know about yet. So resolve it by scanning what's actually on disk instead.
function findChromeDirName(locale, actualChromeDirs) {
  const [lang, region] = locale.split("-");
  const candidates = region ? [`${lang}_${region}`, lang] : [lang];
  return candidates.find((candidate) => actualChromeDirs.includes(candidate));
}

function unwrapExpression(node) {
  while (node && (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node))) {
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

// Syntax errors don't make `ts.createSourceFile` throw — it silently recovers by emitting error
// nodes, which the AST walkers below would then read as an ordinary (wrong) shape. Parse with
// diagnostics first so a malformed file fails loudly instead of quietly mis-evaluating.
function parseTsFile(filePath, relLabel) {
  const source = readFileSync(filePath, "utf8");
  const { diagnostics } = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.Latest },
  });
  const syntaxErrors = (diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (syntaxErrors.length > 0) {
    const messages = syntaxErrors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
    throw new Error(`${relLabel} failed to parse:\n` + messages.map((m) => `    - ${m}`).join("\n"));
  }
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function runCheck(root) {
  const LOCALES_DIR = path.join(root, "src/locales");
  const REFERENCE_LOCALE = "en-US";
  const CHROME_LOCALES_DIR = path.join(root, "src/assets/_locales");
  const CHROME_REFERENCE_LOCALE = "en";
  const TERMINOLOGY_DIR = path.join(root, "docs/references");
  const LOCALES_TS_PATH = path.join(LOCALES_DIR, "locales.ts");

  const rel = (p) => path.relative(root, p);

  let hasError = false;
  const problems = [];
  function reportError(message) {
    hasError = true;
    problems.push({ level: "error", message });
  }
  // For sections whose own parsing can throw (malformed TS): report it as a normal error
  // instead of crashing the whole run, so one broken file doesn't hide problems elsewhere.
  function guard(sectionLabel, fn) {
    try {
      fn();
    } catch (err) {
      reportError(`${sectionLabel}: ${err.message}`);
    }
  }

  const moduleCache = new Map();

  // Parse one TS module: its top-level `const x = {...}` object literals (for resolving
  // same-file identifier references like `grantValuePrompts: grantValuePromptsEnUS`), its
  // default-import bindings resolved to absolute file paths (for the split-file layout, where
  // `editorLangs` maps a locale to an imported identifier), and its `export default {...}`.
  function parseModule(filePath) {
    if (moduleCache.has(filePath)) return moduleCache.get(filePath);

    const sourceFile = parseTsFile(filePath, rel(filePath));

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

    const moduleInfo = { filePath, sourceFile, topLevelConsts, imports, defaultExport };
    moduleCache.set(filePath, moduleInfo);
    return moduleInfo;
  }

  // Flatten an object-literal AST node into dot-path keys, resolving identifiers against the
  // given module's own top-level consts first, then (for the split-file layout) against its
  // imports — recursing into the imported module's default export with ITS OWN scope.
  // `visiting` guards against a circular alias chain recursing forever.
  function flattenNode(node, prefix, out, moduleInfo, visiting = new Set()) {
    node = unwrapExpression(node);
    if (ts.isObjectLiteralExpression(node)) {
      for (const prop of node.properties) {
        if (ts.isPropertyAssignment(prop)) {
          const key = propName(prop.name, moduleInfo.sourceFile);
          if (prop.name && ts.isComputedPropertyName(prop.name) && !ts.isStringLiteralLike(prop.name.expression)) {
            throw new Error(
              `${rel(moduleInfo.filePath)} has a computed property key ("${key}") the checker can't resolve statically.`
            );
          }
          flattenNode(prop.initializer, prefix ? `${prefix}.${key}` : key, out, moduleInfo, visiting);
        } else if (ts.isShorthandPropertyAssignment(prop)) {
          const key = propName(prop.name, moduleInfo.sourceFile);
          flattenNode(prop.name, prefix ? `${prefix}.${key}` : key, out, moduleInfo, visiting);
        } else {
          throw new Error(
            `${rel(moduleInfo.filePath)} has an object property at "${prefix || "<root>"}" the checker can't resolve ` +
              `statically (spread, method, or accessor) — rewrite it as a plain key or extend the checker.`
          );
        }
      }
      return;
    }
    if (ts.isIdentifier(node)) {
      if (moduleInfo.topLevelConsts.has(node.text)) {
        flattenNode(moduleInfo.topLevelConsts.get(node.text), prefix, out, moduleInfo, visiting);
        return;
      }
      if (moduleInfo.imports.has(node.text)) {
        const importedPath = moduleInfo.imports.get(node.text);
        if (visiting.has(importedPath)) {
          throw new Error(`Circular import detected while resolving "${node.text}" back into ${rel(importedPath)}.`);
        }
        const importedModule = parseModule(importedPath);
        if (importedModule.defaultExport) {
          const nextVisiting = new Set(visiting);
          nextVisiting.add(moduleInfo.filePath);
          flattenNode(importedModule.defaultExport, prefix, out, importedModule, nextVisiting);
          return;
        }
        throw new Error(
          `${rel(importedPath)}: imported by ${rel(moduleInfo.filePath)} but has no "export default {...}".`
        );
      }
      // A genuinely unresolved identifier (e.g. an imported helper function, not a locale
      // module) is treated as an opaque leaf value, same as a string/template literal.
      out.add(prefix);
      return;
    }
    if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node) || ts.isCallExpression(node)) {
      out.add(prefix);
      return;
    }
    throw new Error(
      `${rel(moduleInfo.filePath)} has an unsupported expression at "${prefix || "<root>"}" (kind ${ts.SyntaxKind[node.kind]}) ` +
        `the checker can't resolve statically — extend the checker or rewrite it as a plain literal.`
    );
  }

  // Find the entry point for the Monaco editor's language data, whether it's still the original
  // single file or has been split into src/pkg/utils/monaco-editor/langs/<locale>.ts + index.ts
  // (each locale imported into an `editorLangs` map). Support both so a refactor of this file
  // doesn't make the check report a false "file missing".
  function findEditorLangsEntry() {
    const splitIndex = path.join(root, "src/pkg/utils/monaco-editor/langs/index.ts");
    if (existsSync(splitIndex)) return splitIndex;
    const singleFile = path.join(root, "src/pkg/utils/monaco-editor/langs.ts");
    if (existsSync(singleFile)) return singleFile;
    return null;
  }

  // Return a Map from locale code to its flattened key set, for either layout of the Monaco
  // editor's language data.
  function parseEditorLangs(entryPath) {
    const moduleInfo = parseModule(entryPath);
    const editorLangsNode = moduleInfo.topLevelConsts.get("editorLangs");
    if (!editorLangsNode) {
      throw new Error(`Could not find "export const editorLangs = ..." in ${rel(entryPath)}`);
    }

    const localeMap = new Map();
    for (const prop of editorLangsNode.properties) {
      if (!ts.isPropertyAssignment(prop)) {
        throw new Error(`${rel(entryPath)}: editorLangs has an entry the checker can't resolve statically.`);
      }
      const locale = propName(prop.name, moduleInfo.sourceFile);
      const keys = new Set();
      flattenNode(prop.initializer, "", keys, moduleInfo);
      localeMap.set(locale, keys);
    }
    return localeMap;
  }

  const localeDirs = isDir(LOCALES_DIR)
    ? readdirSync(LOCALES_DIR).filter((name) => isDir(path.join(LOCALES_DIR, name)))
    : [];

  // --- 0: src/locales/locales.ts — every locale directory must be registered ---

  guard("src/locales/locales.ts", () => {
    if (!existsSync(LOCALES_TS_PATH)) {
      reportError(`src/locales/locales.ts is missing.`);
      return;
    }

    const sourceFile = parseTsFile(LOCALES_TS_PATH, rel(LOCALES_TS_PATH));

    // `import * as enUS from "./en-US";` — namespace import of a locale directory.
    const namespaceImportsByDir = new Map();
    for (const statement of sourceFile.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        statement.importClause?.namedBindings &&
        ts.isNamespaceImport(statement.importClause.namedBindings) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text.startsWith("./")
      ) {
        const dirName = statement.moduleSpecifier.text.slice(2);
        namespaceImportsByDir.set(dirName, statement.importClause.namedBindings.name.text);
      }
    }

    // `const NS = [...] as const;`
    let nsNode;
    for (const statement of sourceFile.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === "NS" && decl.initializer) {
          const initializer = unwrapExpression(decl.initializer);
          if (ts.isArrayLiteralExpression(initializer)) nsNode = initializer;
        }
      }
    }
    if (!nsNode) {
      reportError(`src/locales/locales.ts does not declare a top-level \`const NS = [...] as const\` array.`);
    } else {
      const nsEntries = new Set();
      for (const el of nsNode.elements) {
        if (!ts.isStringLiteralLike(el)) {
          reportError(`src/locales/locales.ts: NS array has a non-string-literal entry the checker can't resolve.`);
          continue;
        }
        nsEntries.add(el.text);
      }
      if (isDir(path.join(LOCALES_DIR, REFERENCE_LOCALE))) {
        const namespaceFiles = readdirSync(path.join(LOCALES_DIR, REFERENCE_LOCALE))
          .filter((name) => name.endsWith(".json"))
          .map((name) => path.basename(name, ".json"));
        const { missing, extra } = diffKeys(new Set(namespaceFiles), nsEntries);
        if (missing.length > 0) {
          reportError(
            `src/locales/locales.ts: NS array is missing namespace(s) present under src/locales/${REFERENCE_LOCALE}/: ` +
              missing.join(", ")
          );
        }
        if (extra.length > 0) {
          reportError(
            `src/locales/locales.ts: NS array has stale namespace(s) with no matching src/locales/${REFERENCE_LOCALE}/*.json file: ` +
              extra.join(", ")
          );
        }
      }
    }

    // `resources: { "en-US": { title: "...", ...enUS }, ... }` inside `i18n.use(...).init({...})`.
    let resourcesNode;
    (function findResourcesNode(node) {
      if (resourcesNode) return;
      if (
        ts.isPropertyAssignment(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === "resources" &&
        ts.isObjectLiteralExpression(node.initializer)
      ) {
        resourcesNode = node.initializer;
        return;
      }
      ts.forEachChild(node, findResourcesNode);
    })(sourceFile);

    if (!resourcesNode) {
      reportError(`src/locales/locales.ts: could not find a \`resources: {...}\` object passed to i18next's init().`);
      return;
    }

    const registeredLocales = new Map(); // locale code -> spread identifier used, if any
    for (const prop of resourcesNode.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isObjectLiteralExpression(prop.initializer)) continue;
      const localeCode = propName(prop.name, sourceFile);
      const spreadIdent = prop.initializer.properties.find(
        (p) => ts.isSpreadAssignment(p) && ts.isIdentifier(p.expression)
      );
      registeredLocales.set(localeCode, spreadIdent ? spreadIdent.expression.text : null);
    }

    for (const dir of localeDirs) {
      const importIdent = namespaceImportsByDir.get(dir);
      if (!importIdent) {
        reportError(
          `src/locales/locales.ts does not \`import * as X from "./${dir}"\` — the "${dir}" locale directory ` +
            `exists on disk but is never imported, so it can't be registered with i18next.`
        );
        continue;
      }
      const spreadIdent = registeredLocales.get(dir);
      if (spreadIdent === undefined) {
        reportError(
          `src/locales/locales.ts imports "./${dir}" as "${importIdent}" but \`resources\` has no "${dir}" entry ` +
            `spreading it in — the locale is parsed but never registered with i18next.`
        );
      } else if (spreadIdent !== importIdent) {
        reportError(
          `src/locales/locales.ts: resources["${dir}"] does not spread "${importIdent}" (the import bound to ` +
            `"./${dir}") — it looks unregistered or registered under the wrong locale code.`
        );
      }
    }
  });

  // --- 1 & 2: src/locales namespace files + index.ts exports ---

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

      // index.ts must really export every namespace en-US exports (parsed, not string-matched).
      const indexPath = path.join(localeDir, "index.ts");
      if (!existsSync(indexPath)) {
        reportError(`src/locales/${locale}/index.ts is missing.`);
      } else {
        guard(`src/locales/${locale}/index.ts`, () => {
          const indexSourceFile = parseTsFile(indexPath, rel(indexPath));
          const exportedNamespaces = new Set();
          for (const statement of indexSourceFile.statements) {
            if (
              ts.isExportDeclaration(statement) &&
              statement.moduleSpecifier &&
              ts.isStringLiteral(statement.moduleSpecifier) &&
              statement.moduleSpecifier.text.startsWith("./") &&
              statement.moduleSpecifier.text.endsWith(".json")
            ) {
              exportedNamespaces.add(path.basename(statement.moduleSpecifier.text, ".json"));
            }
          }
          for (const file of namespaceFiles) {
            const ns = path.basename(file, ".json");
            if (!exportedNamespaces.has(ns)) {
              reportError(
                `src/locales/${locale}/index.ts does not export namespace "${ns}" (no \`export ... from "./${ns}.json"\`).`
              );
            }
          }
        });
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
      reportError(`Reference file ${rel(chromeReferencePath)} not found.`);
    } else {
      const chromeReferenceKeys = flattenKeys(readJson(chromeReferencePath));
      const actualChromeDirs = readdirSync(CHROME_LOCALES_DIR).filter((name) =>
        isDir(path.join(CHROME_LOCALES_DIR, name))
      );

      for (const locale of localeDirs) {
        if (locale === REFERENCE_LOCALE) continue;
        const chromeDirName = findChromeDirName(locale, actualChromeDirs);

        if (!chromeDirName) {
          reportError(
            `src/assets/_locales has no directory for locale "${locale}" — every locale under src/locales/ must ` +
              `have a chrome.i18n directory (see docs/translation.md).`
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
  } else {
    reportError(`src/assets/_locales directory not found.`);
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

  guard("src/pkg/utils/monaco-editor/langs", () => {
    const editorLangsEntry = findEditorLangsEntry();

    if (!editorLangsEntry) {
      reportError(
        `Could not find the Monaco editor's language data — neither src/pkg/utils/monaco-editor/langs.ts nor ` +
          `src/pkg/utils/monaco-editor/langs/index.ts exists.`
      );
      return;
    }

    const editorLangsByLocale = parseEditorLangs(editorLangsEntry);
    const relPath = rel(editorLangsEntry);

    if (!editorLangsByLocale.has(REFERENCE_LOCALE)) {
      reportError(`${relPath}: editorLangs has no "${REFERENCE_LOCALE}" entry to use as a reference.`);
      return;
    }

    const referenceKeys = editorLangsByLocale.get(REFERENCE_LOCALE);

    for (const locale of localeDirs) {
      if (locale === REFERENCE_LOCALE) continue;

      if (!editorLangsByLocale.has(locale)) {
        reportError(
          `${relPath}: editorLangs has no "${locale}" entry — every locale under src/locales/ must have one ` +
            `(${referenceKeys.size} keys untranslated for the Monaco editor's hover prompts).`
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
  });

  return { problems, hasError };
}

function main() {
  const rootArg = process.argv.find((a) => a.startsWith("--root="));
  const root = rootArg ? path.resolve(rootArg.slice("--root=".length)) : path.resolve(__dirname, "..");

  const { problems, hasError } = runCheck(root);

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
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { runCheck };
