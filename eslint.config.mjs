import { fixupConfigRules } from "@eslint/compat";
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactJsx from "eslint-plugin-react/configs/jsx-runtime.js";
import react from "eslint-plugin-react/configs/recommended.js";
import ts from "typescript-eslint";
import globals from "globals";

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
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_"
        }
      ],
      ...reactHooks.configs.recommended.rules,
    },
  },
  { ignores: ["dist/", "example/"] },
];
