import { fixupConfigRules } from "@eslint/compat";
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactJsx from "eslint-plugin-react/configs/jsx-runtime.js";
import react from "eslint-plugin-react/configs/recommended.js";
import ts from "typescript-eslint";
import globals from "globals";
import requireLastErrorCheck from "./eslint-rules/require-last-error-check.mjs";

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
      ...reactHooks.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "warn",
      "react/prop-types": "off",
      "chrome-error/require-last-error-check": "error",
      "react/jsx-no-literals": "warn",
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
  { ignores: ["dist/", "example/", ".claude/", "playwright-report/", "test-results/", "coverage/"] },
];
