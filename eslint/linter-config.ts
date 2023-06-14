// 由于原库（eslint-plugin-userscripts）使用了 fs 模块，无法在 webpack5 中直接使用，故改写成如下形式
const userscriptsConfig = {
  rules: {
    "userscripts/filename-user": ["error", "always"],
    "userscripts/no-invalid-metadata": ["error", { top: "required" }],
    "userscripts/require-name": ["error", "required"],
    "userscripts/require-description": ["error", "required"],
    "userscripts/require-version": ["error", "required"],
    "userscripts/require-attribute-space-prefix": "error",
    "userscripts/use-homepage-and-url": "error",
    "userscripts/use-download-and-update-url": "error",
    "userscripts/align-attributes": ["error", 2],
    "userscripts/metadata-spacing": ["error", "always"],
    "userscripts/no-invalid-headers": "error",
    "userscripts/no-invalid-grant": "error",
    "userscripts/compat-grant": "off",
    "userscripts/compat-headers": "off",
    "userscripts/better-use-match": "warn",
  },
};

const userscriptsRules = Object.fromEntries(
  Object.keys(userscriptsConfig.rules).map((name) => {
    const ruleName = name.split("/")[1];
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const ruleMeta = require(`eslint-plugin-userscripts/lib/rules/${ruleName}.js`);
    return [
      name,
      {
        ...ruleMeta,
        meta: {
          ...ruleMeta.meta,
          docs: {
            ...ruleMeta.meta.docs,
            url: `https://yash-singh1.github.io/eslint-plugin-userscripts/#/rules/${ruleName}`,
          },
        },
      },
    ];
  })
);

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
    "no-unused-vars": ["error"],
    "no-useless-backreference": ["error"],
    "no-useless-catch": ["error"],
    "no-useless-escape": ["error"],
    "no-with": ["error"],
    "require-yield": ["error"],
    "use-isnan": ["error"],
    "valid-typeof": ["error"],
    ...userscriptsConfig.rules,
  },
  env: {
    es6: true,
    browser: true,
    greasemonkey: true,
  },
};

// 以文本形式导出默认规则
const defaultConfig = JSON.stringify(config);

export { defaultConfig, userscriptsConfig, userscriptsRules };
