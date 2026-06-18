// can be tested with vitest-environment node
import { describe, expect, it } from "vitest";
import type { editor } from "monaco-editor";
import { clearModelEslintFixes, getModelEslintFixKey, type EslintFix } from "./eslintFixCache";

const createMockModel = (uri: string): editor.ITextModel =>
  ({
    uri: {
      toString: () => uri,
    },
  }) as editor.ITextModel;

const marker = {
  startLineNumber: 1,
  endLineNumber: 5,
  startColumn: 1,
  endColumn: 19,
};

const fix: EslintFix = {
  range: {
    startLineNumber: 2,
    endLineNumber: 2,
    startColumn: 9,
    endColumn: 10,
  },
  text: "  ",
};

describe("eslint fix cache", () => {
  it("uses the model uri in fix keys so identical markers from different editors do not collide", () => {
    const modelA = createMockModel("inmemory://model/a");
    const modelB = createMockModel("inmemory://model/b");

    expect(getModelEslintFixKey(modelA, "userscripts/align-attributes", marker)).not.toBe(
      getModelEslintFixKey(modelB, "userscripts/align-attributes", marker)
    );
  });

  it("clears only fixes for the current model", () => {
    const modelA = createMockModel("inmemory://model/a");
    const modelB = createMockModel("inmemory://model/b");
    const map = new Map<string, EslintFix>();
    const keyA = getModelEslintFixKey(modelA, "userscripts/align-attributes", marker);
    const keyB = getModelEslintFixKey(modelB, "userscripts/align-attributes", marker);

    map.set(keyA, fix);
    map.set(keyB, fix);

    clearModelEslintFixes(map, modelA);

    expect(map.has(keyA)).toBe(false);
    expect(map.has(keyB)).toBe(true);
  });
});
