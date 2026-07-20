import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { runCheck } from "./check-i18n.mjs";

// check-i18n.mjs 是 fail-closed 的机械检查：任何它无法静态解析的结构都必须报错，而不是放行。
// 这里用最小 fixture 仓库树（而非真实仓库）逐一复现 PR #1606 review 中指出的可复现 fail-open
// 路径，锁定回归。

const tmpDirs = [];

function makeFixtureRoot() {
  const dir = path.join(os.tmpdir(), `check-i18n-test-${Math.random().toString(36).slice(2)}`);
  tmpDirs.push(dir);

  mkdirSync(path.join(dir, "src/locales/en-US"), { recursive: true });
  mkdirSync(path.join(dir, "src/locales/zh-CN"), { recursive: true });
  mkdirSync(path.join(dir, "src/assets/_locales/en"), { recursive: true });
  mkdirSync(path.join(dir, "src/assets/_locales/zh_CN"), { recursive: true });
  mkdirSync(path.join(dir, "docs/references"), { recursive: true });
  mkdirSync(path.join(dir, "src/pkg/utils/monaco-editor/langs"), { recursive: true });

  writeFileSync(path.join(dir, "src/locales/en-US/common.json"), JSON.stringify({ hello: "hi" }));
  writeFileSync(path.join(dir, "src/locales/en-US/index.ts"), `export { default as common } from "./common.json";\n`);
  writeFileSync(path.join(dir, "src/locales/zh-CN/common.json"), JSON.stringify({ hello: "你好" }));
  writeFileSync(path.join(dir, "src/locales/zh-CN/index.ts"), `export { default as common } from "./common.json";\n`);

  writeFileSync(
    path.join(dir, "src/locales/locales.ts"),
    [
      `import * as enUS from "./en-US";`,
      `import * as zhCN from "./zh-CN";`,
      `const NS = ["common"] as const;`,
      `i18n.use(x).init({`,
      `  ns: [...NS],`,
      `  resources: {`,
      `    "en-US": { title: "English", ...enUS },`,
      `    "zh-CN": { title: "中文", ...zhCN },`,
      `  },`,
      `});`,
      ``,
    ].join("\n")
  );

  writeFileSync(path.join(dir, "src/assets/_locales/en/messages.json"), JSON.stringify({ appName: { message: "x" } }));
  writeFileSync(
    path.join(dir, "src/assets/_locales/zh_CN/messages.json"),
    JSON.stringify({ appName: { message: "y" } })
  );

  writeFileSync(path.join(dir, "docs/references/terminology-en-US.md"), "# en-US\n");
  writeFileSync(path.join(dir, "docs/references/terminology-zh-CN.md"), "# zh-CN\n");

  writeFileSync(
    path.join(dir, "src/pkg/utils/monaco-editor/langs/en-US.ts"),
    `export default {\n  hover: "hover text",\n};\n`
  );
  writeFileSync(
    path.join(dir, "src/pkg/utils/monaco-editor/langs/zh-CN.ts"),
    `export default {\n  hover: "悬停文本",\n};\n`
  );
  writeFileSync(
    path.join(dir, "src/pkg/utils/monaco-editor/langs/index.ts"),
    [
      `import enUS from "./en-US";`,
      `import zhCN from "./zh-CN";`,
      `export const editorLangs = {`,
      `  "en-US": enUS,`,
      `  "zh-CN": zhCN,`,
      `};`,
      ``,
    ].join("\n")
  );

  return dir;
}

function messages(problems, level = "error") {
  return problems.filter((p) => p.level === level).map((p) => p.message);
}

afterEach(() => {
  while (tmpDirs.length) {
    rmSync(tmpDirs.pop(), { recursive: true, force: true });
  }
});

describe("check-i18n 机械完整性检查", () => {
  it("干净的 fixture 仓库应通过检查", () => {
    const { hasError } = runCheck(makeFixtureRoot());
    expect(hasError).toBe(false);
  });

  describe("0. src/locales/locales.ts 与磁盘目录的双向一致性", () => {
    it("存在完整 locale 目录但未在 locales.ts 中 import，应报错而非放行", () => {
      const root = makeFixtureRoot();
      mkdirSync(path.join(root, "src/locales/ja-JP"), { recursive: true });
      writeFileSync(path.join(root, "src/locales/ja-JP/common.json"), JSON.stringify({ hello: "こんにちは" }));
      writeFileSync(
        path.join(root, "src/locales/ja-JP/index.ts"),
        `export { default as common } from "./common.json";\n`
      );
      writeFileSync(path.join(root, "docs/references/terminology-ja-JP.md"), "# ja\n");
      mkdirSync(path.join(root, "src/assets/_locales/ja"), { recursive: true });
      writeFileSync(
        path.join(root, "src/assets/_locales/ja/messages.json"),
        JSON.stringify({ appName: { message: "z" } })
      );
      writeFileSync(
        path.join(root, "src/pkg/utils/monaco-editor/langs/ja-JP.ts"),
        `export default {\n  hover: "x",\n};\n`
      );

      const { hasError, problems } = runCheck(root);
      expect(hasError).toBe(true);
      expect(messages(problems).some((m) => m.includes('import * as X from "./ja-JP"'))).toBe(true);
    });

    it("resources 中缺失已 import 的 locale 条目，应报错", () => {
      const root = makeFixtureRoot();
      writeFileSync(
        path.join(root, "src/locales/locales.ts"),
        [
          `import * as enUS from "./en-US";`,
          `import * as zhCN from "./zh-CN";`,
          `const NS = ["common"] as const;`,
          `i18n.use(x).init({`,
          `  ns: [...NS],`,
          `  resources: {`,
          `    "en-US": { title: "English", ...enUS },`,
          `  },`,
          `});`,
          ``,
        ].join("\n")
      );
      const { hasError, problems } = runCheck(root);
      expect(hasError).toBe(true);
      expect(messages(problems).some((m) => m.includes("never registered with i18next"))).toBe(true);
    });

    it("NS 数组含有真实文件不存在的 stale 命名空间，应报错", () => {
      const root = makeFixtureRoot();
      writeFileSync(
        path.join(root, "src/locales/locales.ts"),
        [
          `import * as enUS from "./en-US";`,
          `import * as zhCN from "./zh-CN";`,
          `const NS = ["common", "ghost"] as const;`,
          `i18n.use(x).init({`,
          `  ns: [...NS],`,
          `  resources: {`,
          `    "en-US": { title: "English", ...enUS },`,
          `    "zh-CN": { title: "中文", ...zhCN },`,
          `  },`,
          `});`,
          ``,
        ].join("\n")
      );
      const { hasError, problems } = runCheck(root);
      expect(hasError).toBe(true);
      expect(messages(problems).some((m) => m.includes("stale namespace(s)") && m.includes("ghost"))).toBe(true);
    });

    it("NS 数组缺少 en-US 下真实存在的命名空间，应报错", () => {
      const root = makeFixtureRoot();
      writeFileSync(path.join(root, "src/locales/en-US/extra.json"), JSON.stringify({ a: "b" }));
      writeFileSync(path.join(root, "src/locales/zh-CN/extra.json"), JSON.stringify({ a: "c" }));
      writeFileSync(
        path.join(root, "src/locales/en-US/index.ts"),
        `export { default as common } from "./common.json";\nexport { default as extra } from "./extra.json";\n`
      );
      writeFileSync(
        path.join(root, "src/locales/zh-CN/index.ts"),
        `export { default as common } from "./common.json";\nexport { default as extra } from "./extra.json";\n`
      );
      const { hasError, problems } = runCheck(root);
      expect(hasError).toBe(true);
      expect(messages(problems).some((m) => m.includes("missing namespace(s)") && m.includes("extra"))).toBe(true);
    });
  });

  describe("2. index.ts 命名空间导出改用真实 AST 解析", () => {
    it("注释掉的 export 字符串不应再骗过检查", () => {
      const root = makeFixtureRoot();
      writeFileSync(
        path.join(root, "src/locales/zh-CN/index.ts"),
        `// export { default as common } from "./common.json";\n`
      );
      const { hasError, problems } = runCheck(root);
      expect(hasError).toBe(true);
      expect(messages(problems).some((m) => m.includes('does not export namespace "common"'))).toBe(true);
    });

    it("index.ts 存在语法错误时应报错而非静默误判", () => {
      const root = makeFixtureRoot();
      writeFileSync(path.join(root, "src/locales/zh-CN/index.ts"), `export { default as common from "./common.json"\n`);
      const { hasError, problems } = runCheck(root);
      expect(hasError).toBe(true);
      expect(messages(problems).some((m) => m.includes("failed to parse"))).toBe(true);
    });
  });

  describe("3. Chrome _locales 覆盖面", () => {
    it("已注册 locale 缺少 _locales 目录应报错（原来只是 warning）", () => {
      const root = makeFixtureRoot();
      rmSync(path.join(root, "src/assets/_locales/zh_CN"), { recursive: true, force: true });
      const { hasError, problems } = runCheck(root);
      expect(hasError).toBe(true);
      expect(messages(problems).some((m) => m.includes("chrome.i18n directory"))).toBe(true);
    });
  });

  describe("5. Monaco editorLangs AST 解析", () => {
    it("缺少某 locale 的 editorLangs 条目应报错（原来只是 warning）", () => {
      const root = makeFixtureRoot();
      rmSync(path.join(root, "src/pkg/utils/monaco-editor/langs/zh-CN.ts"), { force: true });
      writeFileSync(
        path.join(root, "src/pkg/utils/monaco-editor/langs/index.ts"),
        `import enUS from "./en-US";\nexport const editorLangs = {\n  "en-US": enUS,\n};\n`
      );
      const { hasError, problems } = runCheck(root);
      expect(hasError).toBe(true);
      expect(messages(problems).some((m) => m.includes('no "zh-CN" entry'))).toBe(true);
    });

    it("对象展开（spread）应报错，不应静默折叠成空/叶子键集", () => {
      const root = makeFixtureRoot();
      writeFileSync(
        path.join(root, "src/pkg/utils/monaco-editor/langs/zh-CN.ts"),
        `const base = { hover: "悬停文本" };\nexport default {\n  ...base,\n};\n`
      );
      const { hasError, problems } = runCheck(root);
      expect(hasError).toBe(true);
      expect(messages(problems).some((m) => m.includes("can't resolve statically"))).toBe(true);
    });

    it("计算属性键（非字符串字面量）应报错", () => {
      const root = makeFixtureRoot();
      writeFileSync(
        path.join(root, "src/pkg/utils/monaco-editor/langs/zh-CN.ts"),
        `const key = "hover";\nexport default {\n  [key]: "悬停文本",\n};\n`
      );
      const { hasError, problems } = runCheck(root);
      expect(hasError).toBe(true);
      expect(messages(problems).some((m) => m.includes("computed property key"))).toBe(true);
    });

    it("循环别名导入应报错而非栈溢出", () => {
      const root = makeFixtureRoot();
      writeFileSync(
        path.join(root, "src/pkg/utils/monaco-editor/langs/en-US.ts"),
        `import zhCNRef from "./zh-CN";\nexport default {\n  hover: zhCNRef,\n};\n`
      );
      writeFileSync(
        path.join(root, "src/pkg/utils/monaco-editor/langs/zh-CN.ts"),
        `import enUSRef from "./en-US";\nexport default {\n  hover: enUSRef,\n};\n`
      );
      const { hasError, problems } = runCheck(root);
      expect(hasError).toBe(true);
      expect(messages(problems).some((m) => m.includes("Circular import"))).toBe(true);
    });
  });
});
