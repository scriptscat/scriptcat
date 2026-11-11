import { describe, expect, it } from "vitest";
import { compareScriptUpdates } from "./script_similarity";

const script = (body: string, directives: string[] = [], config = "") =>
  [
    "// ==UserScript==",
    "// @name Example",
    "// @namespace example.test",
    "// @version 1.0.0",
    ...directives.map((line) => `// ${line}`),
    "// ==/UserScript==",
    config,
    body,
  ].join("\n");

describe("compareScriptUpdates", () => {
  it("ignores ordinary comments and formatting but preserves metadata semantics", () => {
    const oldCode = script("function sum(a,b){return a+b;}");
    const newCode = script("// ordinary comment\nfunction sum ( a, b ) {\n return a + b; // comment\n}");
    expect(compareScriptUpdates(oldCode, newCode)).toMatchObject({
      codeSimilarity: 1,
      codeComparable: true,
      metadataValid: true,
      metadataChanges: [],
      userConfigChanged: false,
    });
  });

  it("reports a permission-only metadata change at full body similarity", () => {
    const oldCode = script("console.log('same');", ["@grant none"]);
    const newCode = script("console.log('same');", ["@grant GM_xmlhttpRequest", "@connect api.example.com"]);
    expect(compareScriptUpdates(oldCode, newCode)).toMatchObject({
      codeSimilarity: 1,
      metadataValid: true,
      metadataChanges: [
        { tag: "grant", oldValues: ["none"], newValues: ["GM_xmlhttpRequest"], sensitive: true },
        { tag: "connect", oldValues: [], newValues: ["api.example.com"], sensitive: true },
      ],
    });
  });

  it("distinguishes changed @require order, repeated tags, and unknown directives", () => {
    const code = "function boot(){return 1;}";
    const a = script(code, ["@require https://a.test/a.js", "@require https://b.test/b.js", "@custom value"]);
    const b = script(code, ["@require https://b.test/b.js", "@require https://a.test/a.js", "@custom changed"]);
    expect(compareScriptUpdates(a, b).metadataChanges).toEqual([
      {
        tag: "require",
        oldValues: ["https://a.test/a.js", "https://b.test/b.js"],
        newValues: ["https://b.test/b.js", "https://a.test/a.js"],
        sensitive: true,
      },
      { tag: "custom", oldValues: ["value"], newValues: ["changed"], sensitive: true },
    ]);
  });

  it("keeps localized display metadata informational, but exposes its exact change", () => {
    const oldCode = script("console.log(1);", ["@name:zh-CN 旧名称"]);
    const newCode = script("console.log(1);", ["@name:zh-CN 新名称"]);
    expect(compareScriptUpdates(oldCode, newCode).metadataChanges).toEqual([
      { tag: "name:zh-cn", oldValues: ["旧名称"], newValues: ["新名称"], sensitive: false },
    ]);
  });

  it("detects UserConfig changes and malformed userscript metadata", () => {
    const configA = "/* ==UserConfig==\nfoo: 1\n==/UserConfig== */";
    const configB = "/* ==UserConfig==\nfoo: 2\n==/UserConfig== */";
    const oldCode = script("let result = 1;", [], configA);
    const newCode = script("let result = 1;", [], configB);
    expect(compareScriptUpdates(oldCode, newCode)).toMatchObject({
      codeSimilarity: 1,
      userConfigChanged: true,
      metadataValid: true,
    });
    expect(compareScriptUpdates(oldCode, "let result = 1;")).toMatchObject({ metadataValid: false });
  });

  it("retains shingles when code moves, and changes score for changed identifiers", () => {
    const shared = "function shared(value){const next=value+1;return next*2;}";
    const oldCode = script(`${shared}\nfunction left(){return 123;}`);
    const moved = script(`function left(){return 123;}\n${shared}`);
    const renamed = script(`${shared.replaceAll("next", "renamed")}\nfunction left(){return 123;}`);
    const movedScore = compareScriptUpdates(oldCode, moved).codeSimilarity;
    const renamedScore = compareScriptUpdates(oldCode, renamed).codeSimilarity;
    expect(movedScore).toBeGreaterThan(0.5);
    expect(movedScore).toBeLessThan(1);
    expect(renamedScore).toBeLessThan(1);
  });

  it("tokenizes regexes, templates, strings with comment-like text, and Unicode", () => {
    const body = 'const t = `你好 ${name + 1}`; const re = /a+\\/b/g; const url = "https://example.test//x";';
    expect(compareScriptUpdates(script(body), script(`/* ordinary */\n${body}`)).codeSimilarity).toBe(1);
  });

  it("handles short scripts and bottom-k cutoffs for large minified code", () => {
    const tiny = compareScriptUpdates(script("const x=1;"), script("const x=2;"));
    expect(tiny.codeComparable).toBe(true);
    expect(tiny.codeSimilarity).toBeLessThan(1);

    const statements = Array.from({ length: 700 }, (_, index) => `const v${index}=${index};`);
    const original = script(statements.join(""));
    const modified = script([...statements.slice(0, 350), "const added=9999;", ...statements.slice(350)].join(""));
    const comparison = compareScriptUpdates(original, modified);
    expect(comparison.codeComparable).toBe(true);
    expect(comparison.codeSimilarity).toBeGreaterThan(0.9);
    expect(comparison.codeSimilarity).toBeLessThan(1);
  });

  it("returns zero similarity for empty executable bodies without a false exact match", () => {
    const empty = script("");
    expect(compareScriptUpdates(empty, empty)).toMatchObject({ codeSimilarity: 0, codeComparable: false });
    expect(compareScriptUpdates(script("const answer = 42;"), empty)).toMatchObject({
      codeSimilarity: 0,
      codeComparable: false,
    });
  });
});
