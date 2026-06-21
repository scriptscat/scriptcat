import { describe, it, expect, beforeAll } from "vitest";
import { Linter } from "eslint";
import config from "../eslint.config.mjs";

// 这些规则是「机械护栏」(harness)：把 AGENTS.md / 反馈约定里靠人记忆的约束钉成 lint。
// 直接加载真实 eslint.config.mjs 跑 Linter，既验证规则逻辑，也验证它确实被接进了配置、
// 严重级别与作用域都正确（避免规则写了却没生效的「假护栏」）。

// eslint.config.mjs 里 src/pages 块开启了 projectService（类型感知 lint），它要求被检查文件
// 真实存在于 TS 工程中。本测试用内存里的虚拟 fixture 校验这些「纯语法」(AST) 护栏规则，没有
// 对应磁盘文件，会触发 "not found by the project service" 解析失败。护栏规则都不依赖类型信息，
// 故剔除该类型感知块，只保留语法规则的接入与作用域校验。
const syntaxOnlyConfig = config.filter((entry) => !entry?.languageOptions?.parserOptions?.projectService);

const linter = new Linter({ configType: "flat" });

/** 在指定文件路径下 lint 一段代码，返回非致命诊断的 ruleId 列表；解析失败直接抛出。 */
function ruleIdsAt(code, filename) {
  const messages = linter.verify(code, syntaxOnlyConfig, { filename });
  const fatal = messages.find((m) => m.fatal);
  if (fatal) {
    throw new Error(`fixture 解析失败 (${filename}): ${fatal.message}`);
  }
  return messages.map((m) => m.ruleId);
}

describe("harness lint 规则", () => {
  // 首次 linter.verify 需解析整套 flat config（typescript-eslint 解析器 + react 插件），冷启动开销大；
  // 在 beforeAll 预热一次（走 hook 超时而非 850ms 测试超时），避免这次一次性成本偶发落到某个 it 里超时。
  beforeAll(() => {
    ruleIdsAt(`const x = 1;`, "src/pages/foo.tsx");
  });

  describe("① scriptcat/no-i18n-default-value：禁止 t() 内联 defaultValue 兜底", () => {
    const RULE = "scriptcat/no-i18n-default-value";

    it("拦截 t(key, { defaultValue })", () => {
      const ids = ruleIdsAt(`const x = t("ns:a.b", { defaultValue: "中文兜底" });`, "src/pages/foo.tsx");
      expect(ids).toContain(RULE);
    });

    it("拦截 i18n.t / i18next.t 的 defaultValue", () => {
      expect(ruleIdsAt(`i18n.t("k", { defaultValue: "x" });`, "src/pages/foo.tsx")).toContain(RULE);
      expect(ruleIdsAt(`i18next.t("k", { defaultValue: "x" });`, "src/pages/foo.tsx")).toContain(RULE);
    });

    it("放行不带 defaultValue 的 t() 调用", () => {
      expect(ruleIdsAt(`const x = t("ns:a.b");`, "src/pages/foo.tsx")).not.toContain(RULE);
      expect(ruleIdsAt(`const x = t("ns:a.b", { count: 1 });`, "src/pages/foo.tsx")).not.toContain(RULE);
    });

    it("不误伤组件的 defaultValue 属性（如 <Tabs defaultValue>）", () => {
      expect(ruleIdsAt(`const e = <Tabs defaultValue="tools" />;`, "src/pages/foo.tsx")).not.toContain(RULE);
    });

    it("不误伤非 i18n 的成员调用（如 GM_getValue 第二参对象）", () => {
      expect(ruleIdsAt(`store.getValue("k", { defaultValue: 1 });`, "src/pages/foo.tsx")).not.toContain(RULE);
    });
  });

  describe("② no-restricted-imports：强制合并包 radix-ui", () => {
    const RULE = "no-restricted-imports";

    it("拦截从 @radix-ui/react-* 单包导入", () => {
      const ids = ruleIdsAt(`import { Dialog } from "@radix-ui/react-dialog";`, "src/pages/components/ui/dialog.tsx");
      expect(ids).toContain(RULE);
    });

    it("放行从合并包 radix-ui 导入", () => {
      const ids = ruleIdsAt(`import { Dialog } from "radix-ui";`, "src/pages/components/ui/dialog.tsx");
      expect(ids).not.toContain(RULE);
    });
  });

  describe("③ scriptcat/no-raw-color-classname：className 禁止原始调色板/十六进制颜色", () => {
    const RULE = "scriptcat/no-raw-color-classname";

    it("拦截 bg-white 等原始颜色", () => {
      expect(ruleIdsAt(`const e = <div className="p-2 bg-white" />;`, "src/pages/foo.tsx")).toContain(RULE);
    });

    it("拦截带变体前缀的原始颜色（dark:bg-gray-800）", () => {
      expect(ruleIdsAt(`const e = <div className="dark:bg-gray-800" />;`, "src/pages/foo.tsx")).toContain(RULE);
    });

    it("拦截任意值十六进制颜色 bg-[#fff]", () => {
      expect(ruleIdsAt(`const e = <div className="bg-[#fff]" />;`, "src/pages/foo.tsx")).toContain(RULE);
    });

    it("拦截 cn() 内的原始颜色", () => {
      expect(ruleIdsAt(`const e = <div className={cn("bg-white")} />;`, "src/pages/foo.tsx")).toContain(RULE);
    });

    it("放行设计令牌 bg-background / text-foreground / bg-card", () => {
      expect(
        ruleIdsAt(`const e = <div className="bg-background text-foreground border-border" />;`, "src/pages/foo.tsx")
      ).not.toContain(RULE);
      expect(
        ruleIdsAt(`const e = <div className={cn("bg-card", "text-muted-foreground")} />;`, "src/pages/foo.tsx")
      ).not.toContain(RULE);
    });

    it("仅作用于 src/pages（src/app 不受限）", () => {
      expect(ruleIdsAt(`const e = <div className="bg-white" />;`, "src/app/foo.tsx")).not.toContain(RULE);
    });
  });

  describe("④ no-restricted-syntax：src/pages 禁用 forwardRef", () => {
    const RULE = "no-restricted-syntax";

    it("拦截 ui 组件里的 forwardRef(...)", () => {
      const code = `import { forwardRef } from "react"; const C = forwardRef(() => null);`;
      expect(ruleIdsAt(code, "src/pages/components/ui/foo.tsx")).toContain(RULE);
    });

    it("拦截 ui 组件里的 React.forwardRef(...)", () => {
      expect(ruleIdsAt(`const C = React.forwardRef(() => null);`, "src/pages/components/ui/foo.tsx")).toContain(RULE);
    });

    it("拦截 ui 目录之外的页面级组件使用 forwardRef", () => {
      const code = `import { forwardRef } from "react"; const C = forwardRef(() => null);`;
      expect(ruleIdsAt(code, "src/pages/options/routes/ScriptList/components.tsx")).toContain(RULE);
    });

    it("放行 src/pages 之外的组件使用 forwardRef", () => {
      const code = `import { forwardRef } from "react"; const C = forwardRef(() => null);`;
      expect(ruleIdsAt(code, "src/app/foo.tsx")).not.toContain(RULE);
    });
  });
});
