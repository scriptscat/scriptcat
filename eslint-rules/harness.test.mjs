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

const sourceFilenamePattern = /\.(?:[cm]?js|[jt]sx?)$/;

const configuredRuleIds = new Set(syntaxOnlyConfig.flatMap((entry) => Object.keys(entry?.rules ?? {})));

function assertFixtureCode(code) {
  if (typeof code !== "string") {
    throw new TypeError("code must be a string");
  }
}

function assertFixtureFilename(filename) {
  if (typeof filename !== "string") {
    throw new TypeError("filename must be a string");
  }

  const trimmed = filename.trim();
  if (trimmed !== filename || trimmed === "" || !sourceFilenamePattern.test(filename)) {
    throw new TypeError(`filename must be a non-empty source filename: ${filename}`);
  }
}

function assertRuleId(ruleId) {
  if (typeof ruleId !== "string" || ruleId.trim() === "") {
    throw new TypeError("ruleId must be a non-empty string");
  }
  if (!configuredRuleIds.has(ruleId)) {
    throw new Error(`Unknown configured ruleId: ${ruleId}`);
  }
}

/**
 * 用真实 ESLint flat config 检查虚拟文件，返回非致命诊断的 ruleId 列表。
 * `filename` 决定配置作用域；解析失败会抛出异常，避免无效夹具伪装成规则放行。
 * Vitest 用例用 `ruleCountAt({ code, filename, ruleId })` 断言命中数量，并先合并同名虚拟文件的代码片段。
 */
function ruleIdsAt({ code, filename }) {
  // 非法参数直接报错
  assertFixtureCode(code);
  assertFixtureFilename(filename);
  const messages = linter.verify(code, syntaxOnlyConfig, { filename });
  const fatal = messages.find((m) => m.fatal);
  if (fatal) {
    throw new Error(`fixture 解析失败 (${filename}): ${fatal.message}`);
  }
  return messages.map((m) => m.ruleId);
}

/** 返回指定 ruleId 的诊断数量。 */
function ruleCountAt({ code, filename, ruleId }) {
  // 非法参数直接报错
  assertRuleId(ruleId);
  return ruleIdsAt({ code, filename }).filter((id) => id === ruleId).length;
}

describe("harness lint 规则", () => {
  // 首次 linter.verify 需解析整套 flat config（typescript-eslint 解析器 + react 插件），冷启动开销大；
  // 在 beforeAll 预热一次（走 hook 超时而非 850ms 测试超时），避免这次一次性成本偶发落到某个 it 里超时。
  beforeAll(() => {
    ruleIdsAt({ code: `const x = 1;`, filename: "src/pages/foo.tsx" });
  });

  describe("① scriptcat/no-i18n-default-value：禁止 t() 内联 defaultValue 兜底", () => {
    const RULE = "scriptcat/no-i18n-default-value";

    it("拦截 t(key, { defaultValue })", () => {
      expect(
        ruleCountAt({
          code: `const x = t("ns:a.b", { defaultValue: "中文兜底" });`,
          filename: "src/pages/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(1);
    });

    it("拦截 i18n.t / i18next.t 的 defaultValue", () => {
      expect(
        ruleCountAt({
          code: `i18n.t("k", { defaultValue: "x" }); i18next.t("k", { defaultValue: "x" });`,
          filename: "src/pages/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(2);
    });

    it("放行不带 defaultValue 的 t() 调用", () => {
      expect(
        ruleCountAt({
          code: `const x = t("ns:a.b"); const y = t("ns:a.b", { count: 1 });`,
          filename: "src/pages/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(0);
    });

    it("不误伤组件的 defaultValue 属性（如 <Tabs defaultValue>）", () => {
      expect(
        ruleCountAt({
          code: `const e = <Tabs defaultValue="tools" />;`,
          filename: "src/pages/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(0);
    });

    it("不误伤非 i18n 的成员调用（如 GM_getValue 第二参对象）", () => {
      expect(
        ruleCountAt({
          code: `store.getValue("k", { defaultValue: 1 });`,
          filename: "src/pages/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(0);
    });

    it("拦截可选链 / computed 成员调用中的 defaultValue", () => {
      expect(
        ruleCountAt({
          code: `i18n?.t("k", { defaultValue: "x" }); i18next["t"]("k", { defaultValue: "x" });`,
          filename: "src/pages/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(2);
    });

    it("拦截 computed defaultValue key", () => {
      expect(
        ruleCountAt({
          code: `t("k", { ["defaultValue"]: "x" });`,
          filename: "src/pages/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(1);
    });

    it("明确只禁止 defaultValue 对象兜底，不拦截非对象第二参", () => {
      expect(
        ruleCountAt({
          code: `t("k", "fallback text");`,
          filename: "src/pages/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(0);
    });
  });

  describe("② no-restricted-imports：强制合并包 radix-ui", () => {
    const RULE = "no-restricted-imports";

    it("拦截从 @radix-ui/react-* 单包导入", () => {
      expect(
        ruleCountAt({
          code: `import { Dialog } from "@radix-ui/react-dialog";`,
          filename: "src/pages/components/ui/dialog.tsx",
          ruleId: RULE,
        })
      ).toBe(1);
    });

    it("放行从合并包 radix-ui 导入", () => {
      expect(
        ruleCountAt({
          code: `import { Dialog } from "radix-ui";`,
          filename: "src/pages/components/ui/dialog.tsx",
          ruleId: RULE,
        })
      ).toBe(0);
    });
  });

  describe("③ scriptcat/no-raw-color-classname：className 禁止原始调色板/十六进制颜色", () => {
    const RULE = "scriptcat/no-raw-color-classname";

    it("拦截 bg-white 等原始颜色", () => {
      expect(
        ruleCountAt({
          code: `const e = <div className="p-2 bg-white" />;`,
          filename: "src/pages/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(1);
    });

    it("拦截带变体前缀的原始颜色（dark:bg-gray-800）", () => {
      expect(
        ruleCountAt({
          code: `const e = <div className="dark:bg-gray-800" />;`,
          filename: "src/pages/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(1);
    });

    it("拦截任意值十六进制颜色 bg-[#fff]", () => {
      expect(
        ruleCountAt({
          code: `const e = <div className="bg-[#fff]" />;`,
          filename: "src/pages/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(1);
    });

    it("拦截 cn() 内的原始颜色", () => {
      expect(
        ruleCountAt({
          code: `const e = <div className={cn("bg-white")} />;`,
          filename: "src/pages/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(1);
    });

    it("放行设计令牌 bg-background / text-foreground / bg-card", () => {
      expect(
        ruleCountAt({
          code: `const e = <div className="bg-background text-foreground border-border" />; const f = <div className={cn("bg-card", "text-muted-foreground")} />;`,
          filename: "src/pages/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(0);
    });

    it("仅作用于 src/pages（src/app 不受限）", () => {
      expect(
        ruleCountAt({
          code: `const e = <div className="bg-white" />;`,
          filename: "src/app/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(0);
    });

    it("拦截非灰阶 Tailwind 色板（text-red-500 / bg-blue-600）", () => {
      expect(
        ruleCountAt({
          code: `const e = <div className="text-red-500" />; const f = <div className="bg-blue-600" />;`,
          filename: "src/pages/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(2);
    });

    it("拦截带变体和 opacity 后缀的原始色板", () => {
      expect(
        ruleCountAt({
          code: `const e = <div className="hover:text-red-500/80" />; const f = <div className="dark:focus:border-emerald-400" />;`,
          filename: "src/pages/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(2);
    });

    it("拦截 cn() 内的非灰阶原始颜色", () => {
      expect(
        ruleCountAt({
          code: `const e = <div className={cn("bg-purple-500")} />;`,
          filename: "src/pages/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(1);
    });
  });

  describe("④ scriptcat/no-test-waitfor-interaction：waitFor 回调不得重复交互", () => {
    const RULE = "scriptcat/no-test-waitfor-interaction";

    it("拦截 fireEvent 及其导入别名", () => {
      expect(
        ruleCountAt({
          code: `import { fireEvent as fe, waitFor } from "@testing-library/react"; waitFor(() => fe.click(button));`,
          filename: "src/pages/example.test.tsx",
          ruleId: RULE,
        })
      ).toBe(1);
    });

    it("拦截 userEvent 实例交互", () => {
      expect(
        ruleCountAt({
          code: `import userEvent from "@testing-library/user-event"; import { waitFor } from "@testing-library/react"; const user = userEvent.setup(); waitFor(() => user.click(button));`,
          filename: "src/pages/example.test.tsx",
          ruleId: RULE,
        })
      ).toBe(1);
    });

    it("拦截 userEvent 导入别名实例交互", () => {
      expect(
        ruleCountAt({
          code: `import { userEvent as ue } from "@testing-library/user-event"; import { waitFor } from "@testing-library/react"; const u = ue.setup(); waitFor(() => u.type(input, "x"));`,
          filename: "src/pages/example.test.tsx",
          ruleId: RULE,
        })
      ).toBe(1);
    });

    it("拦截 waitFor 导入别名", () => {
      expect(
        ruleCountAt({
          code: `import { fireEvent, waitFor as until } from "@testing-library/react"; until(() => fireEvent.click(button));`,
          filename: "src/pages/example.test.tsx",
          ruleId: RULE,
        })
      ).toBe(1);
    });

    it("放行同名普通函数和被局部变量遮蔽的导入名", () => {
      expect(
        ruleCountAt({
          code: `
            import { fireEvent, fireEvent as fe, waitFor } from "@testing-library/react";

            function localCase() {
              function waitFor(callback) { callback(); }
              const fireEvent = { click() {} };
              waitFor(() => fireEvent.click(button));
            }

            function run(fe) {
              waitFor(() => fe.click(button));
            }

            fireEvent.click(button);
            waitFor(() => expect(screen.getByText("done")).toBeInTheDocument());
          `,
          filename: "src/pages/example.test.tsx",
          ruleId: RULE,
        })
      ).toBe(0);
    });
  });

  describe("⑤ scriptcat/no-test-waitfor-query：存在性查询用 findBy", () => {
    const RULE = "scriptcat/no-test-waitfor-query";

    it("拦截仅包装 getBy 存在性断言的 waitFor", () => {
      expect(
        ruleCountAt({
          code: `import { waitFor } from "@testing-library/react"; waitFor(() => expect(screen.getByText("done")).toBeInTheDocument());`,
          filename: "src/pages/example.test.tsx",
          ruleId: RULE,
        })
      ).toBe(1);
    });

    it("拦截 waitFor 导入别名并放行同名普通函数", () => {
      expect(
        ruleCountAt({
          code: `
          import { waitFor, waitFor as until } from "@testing-library/react";
          until(() => expect(screen.getByText("done")).toBeInTheDocument());

          function localCase() {
            function waitFor(callback) { callback(); }
            waitFor(() => expect(screen.getByText("done")).toBeInTheDocument());
          }
        `,
          filename: "src/pages/example.test.tsx",
          ruleId: RULE,
        })
      ).toBe(1);
    });

    it("放行多断言和非存在性断言", () => {
      expect(
        ruleCountAt({
          code: `
            waitFor(() => { expect(screen.getByText("done")).toBeInTheDocument(); expect(api).toHaveBeenCalled(); });
            waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
          `,
          filename: "src/pages/example.test.tsx",
          ruleId: RULE,
        })
      ).toBe(0);
    });
  });

  describe("⑥ scriptcat/no-test-fixed-sleep：禁止无契约固定休眠", () => {
    const RULE = "scriptcat/no-test-fixed-sleep";

    it("拦截 Playwright waitForTimeout 和 timer Promise", () => {
      expect(
        ruleCountAt({
          code: `await page.waitForTimeout(500);`,
          filename: "e2e/example.spec.ts",
          ruleId: RULE,
        })
      ).toBe(1);
      expect(
        ruleCountAt({
          code: `await new Promise((resolve) => setTimeout(resolve, 0)); await new Promise((resolve) => setTimeout(() => resolve(), 0));`,
          filename: "src/pages/example.test.tsx",
          ruleId: RULE,
        })
      ).toBe(2);
    });

    it("放行带有逐处豁免注释的时序让步和其他 setTimeout", () => {
      expect(
        ruleCountAt({
          code: `// eslint-disable-next-line scriptcat/no-test-fixed-sleep -- listener registration contract\nawait new Promise((resolve) => setTimeout(resolve, 0));`,
          filename: "src/pages/example.test.tsx",
          ruleId: RULE,
        })
      ).toBe(0);
      expect(
        ruleCountAt({
          code: `setTimeout(tick, 10);`,
          filename: "e2e/example.spec.ts",
          ruleId: RULE,
        })
      ).toBe(0);
    });
  });

  describe("⑦ scriptcat/no-test-large-boundary-fixture：大边界夹具必须显式说明", () => {
    const RULE = "scriptcat/no-test-large-boundary-fixture";

    it("拦截显式的一页以上分页边界写法及其 const 别名", () => {
      expect(
        ruleCountAt({
          code: `
          const total = NETWORK_RULES_PAGE_SIZE + 1;
          const rows = Array.from({ length: total }, makeRow);
          Array.from({ length: PAGE_ROWS + 1 }, makeRow);
        `,
          filename: "src/pages/example.test.tsx",
          ruleId: RULE,
        })
      ).toBe(2);
    });

    it("放行非边界夹具和非页面测试", () => {
      expect(
        ruleCountAt({
          code: `
            Array.from({ length: 20 }, makeRow);
            Array.from({ length: PAGE_SIZE + 2 }, makeRow);
            Array.from({ length: itemCount + 1 }, makeItem);
          `,
          filename: "src/pages/example.test.tsx",
          ruleId: RULE,
        })
      ).toBe(0);
      expect(
        ruleCountAt({
          code: `Array.from({ length: PAGE_SIZE + 1 }, makeRow);`,
          filename: "src/pkg/example.test.ts",
          ruleId: RULE,
        })
      ).toBe(0);
    });

    it("只追踪 const 的单级别名", () => {
      expect(
        ruleCountAt({
          code: `
            let total = PAGE_SIZE + 1;
            Array.from({ length: total }, makeRow);

            const aliasedTotal = PAGE_SIZE + 1;
            const count = aliasedTotal;
            Array.from({ length: count }, makeRow);
          `,
          filename: "src/pages/example.test.tsx",
          ruleId: RULE,
        })
      ).toBe(0);
    });

    it("放行词法遮蔽和逐处说明的边界夹具", () => {
      expect(
        ruleCountAt({
          code: `
            const Array = { from() {} };
            Array.from({ length: PAGE_SIZE + 1 }, makeRow);

            // eslint-disable-next-line scriptcat/no-test-large-boundary-fixture -- pagination boundary
            Array.from({ length: PAGE_SIZE + 1 }, makeRow);
          `,
          filename: "src/pages/example.test.tsx",
          ruleId: RULE,
        })
      ).toBe(0);
    });
  });

  describe("⑧ no-restricted-syntax：src/pages 禁用 forwardRef", () => {
    const RULE = "no-restricted-syntax";

    it("拦截 ui 组件里的 forwardRef(...)", () => {
      const code = `import { forwardRef } from "react"; const C = forwardRef(() => null);`;
      expect(
        ruleCountAt({
          code,
          filename: "src/pages/components/ui/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(1);
    });

    it("拦截 ui 组件里的 React.forwardRef(...)", () => {
      expect(
        ruleCountAt({
          code: `const C = React.forwardRef(() => null);`,
          filename: "src/pages/components/ui/foo.tsx",
          ruleId: RULE,
        })
      ).toBe(1);
    });

    it("拦截 ui 目录之外的页面级组件使用 forwardRef", () => {
      const code = `import { forwardRef } from "react"; const C = forwardRef(() => null);`;
      expect(
        ruleCountAt({
          code,
          filename: "src/pages/options/routes/ScriptList/components.tsx",
          ruleId: RULE,
        })
      ).toBe(1);
    });

    it("放行 src/pages 之外的组件使用 forwardRef", () => {
      const code = `import { forwardRef } from "react"; const C = forwardRef(() => null);`;
      expect(ruleCountAt({ code, filename: "src/app/foo.tsx", ruleId: RULE })).toBe(0);
    });
  });
});
