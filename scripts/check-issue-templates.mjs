#!/usr/bin/env node

// Mechanical check for .github/ISSUE_TEMPLATE/*.yaml.
//
// Fail-closed by design: anything the checker cannot statically resolve is reported as an error
// asking a human to extend the check, never passed through. A silently-broken issue form is
// invisible in review — GitHub simply refuses to render it, or drops a prefilled value, and
// nobody notices until a user hits it.
//
// Checks:
//   1. Every template parses as YAML and satisfies GitHub's issue-form schema: known top-level
//      keys, `name`/`description`/`body` present, known element types, unique non-empty ids,
//      `markdown` blocks carry neither id nor validations, dropdown/checkboxes have options,
//      and checkboxes use per-option `required` rather than `validations.required`.
//   2. zh/en parity — templates pair by numeric prefix (0N ↔ 1N). The pair must expose the same
//      element sequence (type, id, required, render, multiple) and the same title/type/labels,
//      so a field added to one language cannot silently go missing in the other.
//   3. The `issues/new?...` prefill contract. GitHub prefills an issue form from query params
//      keyed by *field id*, so renaming or dropping an id silently breaks every link that used
//      it — including links baked into already-installed extension builds, which keep sending
//      the old param forever. Every such URL built in src/ is parsed from the TypeScript AST
//      (not string-matched) and each of its params must resolve to a real id in every template
//      the URL can select.
//
// Run with `--root=<path>` to check a tree other than this file's repo checkout.

import process from "node:process";
import { readdirSync, readFileSync, existsSync, statSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEMPLATE_DIR = ".github/ISSUE_TEMPLATE";
const TOP_LEVEL_KEYS = new Set(["name", "description", "title", "labels", "assignees", "body", "type", "projects"]);
const ELEMENT_TYPES = new Set(["markdown", "textarea", "input", "dropdown", "checkboxes"]);

function walkFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walkFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Collapse a `a + b + c` chain of string/template literals into one static skeleton, replacing
// each `${...}` with "\0" so the result stays parseable as a URL shape while marking the spots
// whose value is only known at runtime.
function staticText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((span) => "\0" + span.literal.text).join("");
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticText(node.left);
    const right = staticText(node.right);
    return left === null || right === null ? null : left + right;
  }
  if (ts.isParenthesizedExpression(node)) return staticText(node.expression);
  return null;
}

// ts.forEachChild aborts as soon as its callback returns a truthy value, so the visitor must
// return undefined — returning the accumulator here silently stops after the first child.
function collectStringLiterals(node, out = []) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node.text);
  node.forEachChild((child) => {
    collectStringLiterals(child, out);
  });
  return out;
}

// The whole expression a URL literal belongs to, so `"...?" + \`template=${a ? "x" : "y"}\`` is
// reconstructed as one unit rather than three unrelated fragments.
function outermostConcat(node) {
  let current = node;
  while (
    current.parent &&
    ((ts.isBinaryExpression(current.parent) && current.parent.operatorToken.kind === ts.SyntaxKind.PlusToken) ||
      ts.isParenthesizedExpression(current.parent))
  ) {
    current = current.parent;
  }
  return current;
}

function readTemplates(root, problems) {
  const dir = path.join(root, TEMPLATE_DIR);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    problems.push(`${TEMPLATE_DIR}/ not found — issue templates must live there.`);
    return {};
  }

  const templates = {};
  for (const file of readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f) && f !== "config.yml")
    .sort()) {
    const source = readFileSync(path.join(dir, file), "utf8");
    const doc = YAML.parseDocument(source, { prettyErrors: true, strict: true });
    if (doc.errors.length > 0) {
      for (const error of doc.errors) problems.push(`${TEMPLATE_DIR}/${file}: invalid YAML — ${error.message}`);
      continue;
    }
    templates[file] = doc.toJS();
  }
  return templates;
}

function checkSchema(file, doc, problems) {
  const where = `${TEMPLATE_DIR}/${file}`;

  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    problems.push(`${where}: top level must be a mapping.`);
    return;
  }
  for (const key of Object.keys(doc)) {
    if (!TOP_LEVEL_KEYS.has(key)) problems.push(`${where}: unknown top-level key "${key}".`);
  }
  for (const key of ["name", "description", "body"]) {
    if (!doc[key]) problems.push(`${where}: missing required top-level "${key}".`);
  }
  if (!Array.isArray(doc.body)) {
    if (doc.body) problems.push(`${where}: "body" must be a list.`);
    return;
  }

  const seen = new Set();
  doc.body.forEach((element, index) => {
    const at = `${where} body[${index}]`;
    if (element === null || typeof element !== "object") {
      problems.push(`${at}: element must be a mapping.`);
      return;
    }
    const attributes = element.attributes ?? {};

    if (!ELEMENT_TYPES.has(element.type)) {
      problems.push(`${at}: unknown element type "${element.type}".`);
      return;
    }

    if (element.type === "markdown") {
      if (element.id) problems.push(`${at}: markdown blocks must not declare an id.`);
      if (element.validations) problems.push(`${at}: markdown blocks must not declare validations.`);
      if (!attributes.value) problems.push(`${at}: markdown block missing attributes.value.`);
      return;
    }

    if (!element.id) {
      problems.push(`${at}: missing id — prefill links address fields by id.`);
    } else if (seen.has(element.id)) {
      problems.push(`${at}: duplicate id "${element.id}".`);
    }
    seen.add(element.id);

    if (!attributes.label) problems.push(`${at}: missing attributes.label.`);

    if (element.type === "dropdown" || element.type === "checkboxes") {
      if (!Array.isArray(attributes.options) || attributes.options.length === 0) {
        problems.push(`${at}: ${element.type} must declare a non-empty options list.`);
      }
    }
    if (element.type === "checkboxes" && element.validations) {
      problems.push(`${at}: checkboxes mark required per option, not via validations.`);
    }
  });
}

function elementShape(doc) {
  return (doc.body ?? [])
    .filter((element) => element && typeof element === "object")
    .map((element) => {
      const attributes = element.attributes ?? {};
      return [
        element.type,
        element.id ?? "-",
        element.validations?.required ? "required" : "optional",
        attributes.render ? `render=${attributes.render}` : "",
        attributes.multiple ? "multiple" : "",
      ]
        .filter(Boolean)
        .join(":");
    });
}

// zh templates are 0N_*, their en mirrors 1N_*_en.
function checkLanguageParity(templates, problems) {
  for (const file of Object.keys(templates)) {
    const match = /^0(\d)_(.+)\.yaml$/.exec(file);
    if (!match) continue;
    const [, digit, slug] = match;
    const mirror = `1${digit}_${slug}_en.yaml`;

    if (!templates[mirror]) {
      problems.push(`${TEMPLATE_DIR}/${file}: missing English mirror ${mirror}.`);
      continue;
    }

    const zh = templates[file];
    const en = templates[mirror];

    const zhShape = elementShape(zh);
    const enShape = elementShape(en);
    if (JSON.stringify(zhShape) !== JSON.stringify(enShape)) {
      problems.push(
        `${file} / ${mirror}: element structure differs — the two languages must expose the same fields.\n` +
          `    zh: ${JSON.stringify(zhShape)}\n` +
          `    en: ${JSON.stringify(enShape)}`
      );
    }
    for (const key of ["title", "type"]) {
      if (zh[key] !== en[key]) problems.push(`${file} / ${mirror}: top-level "${key}" differs.`);
    }
    if (JSON.stringify(zh.labels) !== JSON.stringify(en.labels)) {
      problems.push(`${file} / ${mirror}: "labels" differ.`);
    }

    for (const type of ["dropdown", "checkboxes"]) {
      const zhElements = (zh.body ?? []).filter((element) => element?.type === type);
      const enElements = (en.body ?? []).filter((element) => element?.type === type);
      zhElements.forEach((element, index) => {
        const zhCount = element.attributes?.options?.length ?? 0;
        const enCount = enElements[index]?.attributes?.options?.length ?? 0;
        if (zhCount !== enCount) {
          problems.push(
            `${file} / ${mirror}: ${type} "${element.id}" has ${zhCount} options in zh but ${enCount} in en.`
          );
        }
      });
    }
  }
}

function checkPrefillContract(root, templates, problems) {
  const srcDir = path.join(root, "src");
  if (!existsSync(srcDir)) return;

  const ids = Object.fromEntries(
    Object.entries(templates).map(([file, doc]) => [
      file,
      new Set((doc.body ?? []).map((element) => element?.id).filter(Boolean)),
    ])
  );

  for (const file of walkFiles(srcDir)) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("issues/new")) continue;

    const relative = path.relative(root, file);
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const expressions = new Set();

    const visit = (node) => {
      if (
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) &&
        (staticText(node) ?? "").includes("issues/new")
      ) {
        expressions.add(outermostConcat(node));
      }
      node.forEachChild(visit);
    };
    visit(sourceFile);

    for (const expression of expressions) {
      const url = staticText(expression);
      if (url === null) {
        problems.push(
          `${relative}: found an issues/new URL this check cannot statically resolve. ` +
            `Extend scripts/check-issue-templates.mjs rather than leaving the prefill contract unverified.`
        );
        continue;
      }

      const params = [...url.matchAll(/[?&\0]([a-zA-Z][\w-]*)=/g)].map((m) => m[1]).filter((p) => p !== "template");
      if (params.length === 0) continue;

      // `template=` is either spelled out inline (`template=01_bug_report.yaml&...`, so the name
      // sits in the surrounding literal text) or chosen at runtime between locale variants
      // (`template=${cond ? "01_bug_report" : "11_bug_report_en"}.yaml`, so the candidates are
      // string literals in the expression). Collect both, and treat every candidate as reachable.
      const targets = new Set();
      const addCandidate = (value) => {
        const name = /^(\d\d_\w+?)(\.yaml)?$/.exec(value)?.[1];
        if (name && ids[`${name}.yaml`]) targets.add(`${name}.yaml`);
      };
      addCandidate(/[?&\0]template=([^&\0]+)/.exec(url)?.[1] ?? "");
      for (const literal of collectStringLiterals(expression)) addCandidate(literal);

      if (targets.size === 0) {
        problems.push(
          `${relative}: issues/new URL prefills ${params.map((p) => `"${p}"`).join(", ")} ` +
            `but no known template file could be resolved from it — the prefill target is unverifiable.`
        );
        continue;
      }

      for (const target of targets) {
        for (const param of params) {
          if (!ids[target].has(param)) {
            problems.push(
              `${relative}: prefills "${param}=", but ${TEMPLATE_DIR}/${target} has no field with that id. ` +
                `GitHub silently drops unknown prefill params, and installed builds keep sending the old name.`
            );
          }
        }
      }
    }
  }
}

function runCheck(root) {
  const problems = [];
  const templates = readTemplates(root, problems);

  for (const [file, doc] of Object.entries(templates)) checkSchema(file, doc, problems);
  checkLanguageParity(templates, problems);
  checkPrefillContract(root, templates, problems);

  return { problems, templateCount: Object.keys(templates).length };
}

function main() {
  const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
  const root = rootArg ? path.resolve(rootArg.slice("--root=".length)) : path.resolve(__dirname, "..");

  const { problems, templateCount } = runCheck(root);

  if (problems.length === 0) {
    console.log(`✅ issue template check passed: ${templateCount} templates valid, mirrored, prefill ids intact.`);
    process.exit(0);
  }

  for (const problem of problems) console.error(`\n❌ ${problem}`);
  console.error("\nIssue template check failed. Fix the problems above before submitting.");
  process.exit(1);
}

// Same argv/import.meta.url normalization rationale as scripts/check-i18n.mjs: compare real paths
// on both sides, or the check silently no-ops under symlinked or non-ASCII repo paths.
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main();
}

export { runCheck };
