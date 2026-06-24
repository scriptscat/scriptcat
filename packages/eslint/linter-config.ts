/* eslint-disable @typescript-eslint/no-require-imports */
const { configs } = require("eslint-plugin-userscripts");

// 默认规则
const config = {
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "script",
    ecmaFeatures: {
      globalReturn: true,
    },
  },
  globals: {
    CATRetryError: "readonly",
    CAT_fileStorage: "readonly",
    CAT_userConfig: "readonly",
    CAT_registerMenuInput: "readonly",
    CAT_unregisterMenuInput: "readonly",
    CAT_scriptLoaded: "readonly",
  },
  rules: {
    "constructor-super": ["error"],
    "for-direction": ["error"],
    "getter-return": ["error"],
    "no-async-promise-executor": ["error"],
    "no-case-declarations": ["error"],
    "no-class-assign": ["error"],
    "no-compare-neg-zero": ["error"],
    "no-cond-assign": ["error"],
    "no-const-assign": ["error"],
    "no-constant-condition": ["error"],
    "no-control-regex": ["error"],
    "no-debugger": ["error"],
    "no-delete-var": ["error"],
    "no-dupe-args": ["error"],
    "no-dupe-class-members": ["error"],
    "no-dupe-else-if": ["error"],
    "no-dupe-keys": ["error"],
    "no-duplicate-case": ["error"],
    "no-empty": ["error"],
    "no-empty-character-class": ["error"],
    "no-empty-pattern": ["error"],
    "no-ex-assign": ["error"],
    "no-extra-boolean-cast": ["error"],
    "no-extra-semi": ["error"],
    "no-fallthrough": ["error"],
    "no-func-assign": ["error"],
    "no-global-assign": ["error"],
    "no-import-assign": ["error"],
    "no-inner-declarations": ["error"],
    "no-invalid-regexp": ["error"],
    "no-irregular-whitespace": ["error"],
    "no-loss-of-precision": ["error"],
    "no-misleading-character-class": ["error"],
    "no-mixed-spaces-and-tabs": ["error"],
    "no-new-symbol": ["error"],
    "no-nonoctal-decimal-escape": ["error"],
    "no-obj-calls": ["error"],
    "no-octal": ["error"],
    "no-prototype-builtins": ["error"],
    "no-redeclare": ["error"],
    "no-regex-spaces": ["error"],
    "no-self-assign": ["error"],
    "no-setter-return": ["error"],
    "no-shadow-restricted-names": ["error"],
    "no-sparse-arrays": ["error"],
    "no-this-before-super": ["error"],
    "no-undef": ["warn"],
    "no-unexpected-multiline": ["error"],
    "no-unreachable": ["error"],
    "no-unsafe-finally": ["error"],
    "no-unsafe-negation": ["error"],
    "no-unsafe-optional-chaining": ["error"],
    "no-unused-labels": ["error"],
    "no-unused-vars": ["warn"],
    "no-useless-backreference": ["error"],
    "no-useless-catch": ["error"],
    "no-useless-escape": ["error"],
    "no-with": ["error"],
    "require-yield": ["error"],
    "use-isnan": ["error"],
    "valid-typeof": ["error"],
    ...configs.recommended.rules,
    // -- default --
    // userscripts/align-attributes: For readability when debugging and editing the userscript.
    // userscripts/better-use-match: Chrome Manifest Version 3 will probably result in deprecation of support for the `include` attribute for security reasons.
    // userscripts/compat-grant: Ensures that you aren't using permissions that you don't support or don't want to support.
    // userscripts/compat-headers: Ensures that you aren't using declarations that you don't support or don't want to support.
    // userscripts/filename-user: It is a good practice to end userscripts in a .user.js.
    // userscripts/metadata-spacing: To follow best practices for userscript code styling.
    // userscripts/no-invalid-grant: So as to avoid typos that might result in `GM_* is not defined` errors.
    // userscripts/no-invalid-headers: So as to avoid typos in the userscript headers which might have unintended consequences.
    // userscripts/no-invalid-metadata: So errors don't come and the metadata is provided for ease of handling userscripts and users in production.
    // userscripts/require-attribute-space-prefix: To ensure maximum compatibility.
    // userscripts/require-description: To give a better description on the userscript and to make sure that there is not accidentally more than one.
    // userscripts/require-download-url: Some userscript managers require `downloadURL` for source downloads because `updateURL` is used solely for metadata downloads.
    // userscripts/require-name: To prevent errors and allow the user to understand what userscripts they have installed.
    // userscripts/require-version: To prevent errors, keep track of changes, and ensure updates get pushed.
    // userscripts/use-homepage-and-url: For compatibility with different userscript runners.
    // -- override --
    "userscripts/align-attributes": ["warn", 2],
    "userscripts/use-homepage-and-url": ["off"],
    "userscripts/require-download-url": ["warn"],
  },
  env: {
    es6: true,
    browser: true,
    greasemonkey: true,
  },
};

// 以文本形式导出默认规则
export const defaultConfig = JSON.stringify(config, null, 2);
