import { fixupConfigRules } from "@eslint/compat";
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactJsx from "eslint-plugin-react/configs/jsx-runtime.js";
import react from "eslint-plugin-react/configs/recommended.js";
import ts from "typescript-eslint";
import globals from "globals";
import requireLastErrorCheck from "./eslint-rules/require-last-error-check.mjs";
import noI18nDefaultValue from "./eslint-rules/no-i18n-default-value.mjs";
import noRawColorClassname from "./eslint-rules/no-raw-color-classname.mjs";

export default [
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...fixupConfigRules([
    {
      ...react,
      settings: {
        react: { version: "detect" },
      },
    },
    reactJsx,
  ]),
  {
    plugins: {
      "react-hooks": reactHooks,
      "chrome-error": {
        rules: {
          "require-last-error-check": requireLastErrorCheck,
        },
      },
      scriptcat: {
        rules: {
          "no-i18n-default-value": noI18nDefaultValue,
          "no-raw-color-classname": noRawColorClassname,
        },
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      ...reactHooks.configs["recommended-latest"].rules,
      "react-hooks/exhaustive-deps": "error",
      "react/prop-types": "off",
      "chrome-error/require-last-error-check": "error",
      "scriptcat/no-i18n-default-value": "error",
      "react/jsx-no-literals": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "sonner",
              importNames: ["toast"],
              message: "业务层请用 notify（@App/pages/components/ui/toast），不要直接 import sonner 的 toast。",
            },
          ],
          patterns: [
            {
              group: ["@radix-ui/react-*"],
              message: '请从合并包 radix-ui 导入（import { X } from "radix-ui"），不要用 @radix-ui/react-* 单包。',
            },
          ],
        },
      ],
    },
  },
  prettier,
  {
    files: ["e2e/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    files: ["src/pages/components/ui/toast.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // new-ui 页面禁止 className 写原始颜色，必须走设计令牌以适配亮/暗主题。
    files: ["src/pages/**/*.tsx"],
    rules: { "scriptcat/no-raw-color-classname": "error" },
  },
  {
    // new-ui 页面统一用 React 19 function + ref-prop 写法，禁用 forwardRef。
    files: ["src/pages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='forwardRef']",
          message: "请用 React 19 的 function + ref-prop 写法，不要用 forwardRef。",
        },
        {
          selector: "CallExpression[callee.object.name='React'][callee.property.name='forwardRef']",
          message: "请用 React 19 的 function + ref-prop 写法，不要用 React.forwardRef。",
        },
      ],
    },
  },
  {
    // 类型感知规则：只在 src/pages 开启 projectService，抓异步相关真 bug（漏 await、async 误用作 handler 等）。
    // 仅此 block 设 projectService，其它文件不付出类型检查开销；这些规则已全部升级为 error，违规阻断 CI。
    // 排除测试文件：类型感知规则面向生产页面代码，测试里的浮动 promise 多为有意；且同名的
    // *.test.ts / *.test.tsx 会被 TS 程序按扩展名去重（只保留 .ts），导致 projectService 找不到被去重的文件而解析失败。
    files: ["src/pages/**/*.{ts,tsx}"],
    ignores: ["src/pages/**/*.test.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      // 允许把 async 函数直接传给 JSX 事件处理器属性（React 不会 await 返回值，是惯用写法）；
      // 其余 void 上下文（函数参数 / 对象属性 / 变量赋值）仍然检查。
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      "@typescript-eslint/await-thenable": "error",
    },
  },
  { ignores: ["dist/", "example/", ".claude/", "playwright-report/", "test-results/", "coverage/"] },
];
