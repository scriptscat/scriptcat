import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const root = process.cwd();
const maxTestTimeoutMs = 40_000;
const checkedHelpers = new Map([
  ["runInlineTestScript", 4],
  ["runTestScript", 4],
]);
const violations = [];

const numericValue = (node) => {
  if (ts.isNumericLiteral(node)) return Number(node.text.replaceAll("_", ""));
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.PlusToken) return numericValue(node.operand);
  return undefined;
};

const callName = (expression) => {
  if (ts.isIdentifier(expression)) return expression.text;
  if (!ts.isPropertyAccessExpression(expression)) return undefined;
  const owner = callName(expression.expression);
  return owner ? `${owner}.${expression.name.text}` : expression.name.text;
};

const report = (sourceFile, node, label, value) => {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  violations.push(
    `${path.relative(root, sourceFile.fileName)}:${position.line + 1}: ${label} is ${value}ms (maximum ${maxTestTimeoutMs}ms)`
  );
};

const checkFile = (fileName) => {
  const source = fs.readFileSync(fileName, "utf8");
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const name = callName(node.expression);
      if (name === "test.setTimeout") {
        const value = numericValue(node.arguments[0]);
        if (value !== undefined && value > maxTestTimeoutMs) report(sourceFile, node, "test timeout", value);
      }
      const helperArgument = checkedHelpers.get(name);
      if (helperArgument !== undefined) {
        const value = numericValue(node.arguments[helperArgument]);
        if (value !== undefined && value > maxTestTimeoutMs) report(sourceFile, node, `${name} timeout`, value);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
};

const e2eDir = path.join(root, "e2e");
for (const entry of fs.readdirSync(e2eDir, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".spec.ts")) checkFile(path.join(e2eDir, entry.name));
}

const configFile = path.join(root, "playwright.config.ts");
const configSource = fs.readFileSync(configFile, "utf8");
const configMatch = configSource.match(/\btimeout\s*:\s*([0-9][0-9_]*)/);
const configTimeout = configMatch ? Number(configMatch[1].replaceAll("_", "")) : undefined;
if (configTimeout === undefined) {
  violations.push("playwright.config.ts: missing a numeric global timeout");
} else if (configTimeout > maxTestTimeoutMs) {
  violations.push(`playwright.config.ts: global timeout is ${configTimeout}ms (maximum ${maxTestTimeoutMs}ms)`);
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`E2E test budgets are capped at ${maxTestTimeoutMs}ms.`);
}
