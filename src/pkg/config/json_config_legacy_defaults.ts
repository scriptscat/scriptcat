// 稀疏格式发布前的默认配置快照。迁移旧版全量配置时必须使用这份快照，不能引用当前默认配置。
export const legacyJsonConfigDefaults: Record<"eslint_config" | "editor_config", string> = {
  eslint_config: `{
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "script",
    "ecmaFeatures": {
      "globalReturn": true
    }
  },
  "globals": {
    "CATRetryError": "readonly",
    "CAT_fileStorage": "readonly",
    "CAT_userConfig": "readonly",
    "CAT_registerMenuInput": "readonly",
    "CAT_unregisterMenuInput": "readonly",
    "CAT_scriptLoaded": "readonly",
    "CAT": "readonly"
  },
  "rules": {
    "constructor-super": [
      "error"
    ],
    "for-direction": [
      "error"
    ],
    "getter-return": [
      "warn"
    ],
    "no-async-promise-executor": [
      "error"
    ],
    "no-case-declarations": [
      "error"
    ],
    "no-class-assign": [
      "error"
    ],
    "no-compare-neg-zero": [
      "error"
    ],
    "no-cond-assign": [
      "warn"
    ],
    "no-const-assign": [
      "error"
    ],
    "no-constant-condition": [
      "error"
    ],
    "no-control-regex": [
      "error"
    ],
    "no-debugger": [
      "error"
    ],
    "no-delete-var": [
      "error"
    ],
    "no-dupe-args": [
      "error"
    ],
    "no-dupe-class-members": [
      "error"
    ],
    "no-dupe-else-if": [
      "error"
    ],
    "no-dupe-keys": [
      "error"
    ],
    "no-duplicate-case": [
      "error"
    ],
    "no-empty": [
      "error",
      {
        "allowEmptyCatch": true
      }
    ],
    "no-empty-character-class": [
      "error"
    ],
    "no-empty-pattern": [
      "error"
    ],
    "no-ex-assign": [
      "error"
    ],
    "no-extra-boolean-cast": [
      "error"
    ],
    "no-extra-semi": [
      "error"
    ],
    "no-fallthrough": [
      "error"
    ],
    "no-func-assign": [
      "error"
    ],
    "no-global-assign": [
      "warn"
    ],
    "no-import-assign": [
      "error"
    ],
    "no-inner-declarations": [
      "error"
    ],
    "no-invalid-regexp": [
      "error"
    ],
    "no-irregular-whitespace": [
      "error"
    ],
    "no-loss-of-precision": [
      "error"
    ],
    "no-misleading-character-class": [
      "error"
    ],
    "no-mixed-spaces-and-tabs": [
      "error"
    ],
    "no-new-symbol": [
      "error"
    ],
    "no-nonoctal-decimal-escape": [
      "error"
    ],
    "no-obj-calls": [
      "error"
    ],
    "no-octal": [
      "error"
    ],
    "no-prototype-builtins": [
      "error"
    ],
    "no-redeclare": [
      "error",
      {
        "builtinGlobals": false
      }
    ],
    "no-regex-spaces": [
      "error"
    ],
    "no-self-assign": [
      "error"
    ],
    "no-setter-return": [
      "warn"
    ],
    "no-shadow-restricted-names": [
      "error"
    ],
    "no-sparse-arrays": [
      "error"
    ],
    "no-this-before-super": [
      "error"
    ],
    "no-undef": [
      "warn"
    ],
    "no-unexpected-multiline": [
      "error"
    ],
    "no-unreachable": [
      "error"
    ],
    "no-unsafe-finally": [
      "error"
    ],
    "no-unsafe-negation": [
      "error"
    ],
    "no-unsafe-optional-chaining": [
      "error"
    ],
    "no-unused-labels": [
      "error"
    ],
    "no-unused-vars": [
      "warn"
    ],
    "no-useless-backreference": [
      "error"
    ],
    "no-useless-catch": [
      "error"
    ],
    "no-useless-escape": [
      "error",
      {
        "allowRegexCharacters": [
          "-",
          "&",
          "/"
        ]
      }
    ],
    "no-with": [
      "error"
    ],
    "require-yield": [
      "error"
    ],
    "use-isnan": [
      "error"
    ],
    "valid-typeof": [
      "error"
    ],
    "userscripts/filename-user": [
      "error",
      "always"
    ],
    "userscripts/no-invalid-metadata": [
      "off"
    ],
    "userscripts/require-name": [
      "off"
    ],
    "userscripts/require-description": [
      "error",
      "required"
    ],
    "userscripts/require-version": [
      "error",
      "required"
    ],
    "userscripts/require-attribute-space-prefix": "error",
    "userscripts/use-homepage-and-url": [
      "off"
    ],
    "userscripts/require-download-url": [
      "warn"
    ],
    "userscripts/align-attributes": [
      "off"
    ],
    "userscripts/metadata-spacing": "error",
    "userscripts/no-invalid-headers": "error",
    "userscripts/no-invalid-grant": "error",
    "userscripts/compat-grant": "off",
    "userscripts/compat-headers": "off",
    "userscripts/better-use-match": [
      "off"
    ]
  },
  "env": {
    "es6": true,
    "browser": true,
    "greasemonkey": true
  }
}`,
  editor_config: `{
  "noSemanticValidation": true,
  "noSyntaxValidation": false,
  "onlyVisible": false,
  "allowNonTsExtensions": true,
  "allowJs": true,
  "checkJs": true,
  "noUnusedLocals": false,
  "noFallthroughCasesInSwitch": false,
  "noImplicitThis": false,
  "strict": true
}`,
};
