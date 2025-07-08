module.exports = {
  env: {
    browser: true,
    es2021: true,
    webextensions: true,
  },
  extends: [
    "plugin:react/recommended",
    "airbnb",
    "plugin:prettier/recommended",
    "eslint-config-prettier",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: "latest",
    sourceType: "module",
  },
  globals: {
    GMTypes: "readonly",
    GMSend: "readonly",
  },
  plugins: ["react", "@typescript-eslint", "prettier"],
  rules: {
    "no-restricted-syntax": "off",
    "react/require-default-props": "off",
    "react/jsx-filename-extension": [1, { extensions: [".tsx"] }],
    "no-unused-expressions": ["error", { allowShortCircuit: true }],
    "react/jsx-props-no-spreading": "off",
    "import/extensions": [
      "error",
      "ignorePackages",
      {
        ts: "never",
        tsx: "never",
      },
    ],
    "no-use-before-define": "off",
    "no-param-reassign": "off",
    "no-bitwise": "off",
    "class-methods-use-this": "off",
    "@typescript-eslint/no-use-before-define": ["error"],
    "react/function-component-definition": [
      2,
      {
        namedComponents: ["function-declaration", "arrow-function"],
      },
    ],
    "@typescript-eslint/no-unused-vars": [
      2,
      {
        args: "none",
      },
    ],
    "import/order": "off",
    "import/no-duplicates": "off",
    "import/prefer-default-export": "off",
    "no-plusplus": "off",
    "prettier/prettier": "off",
  },
  settings: {
    "import/resolver": {
      node: {
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      },
      alias: {
        map: [
          ["@App", "./src/"],
          ["@Pkg", "./pkg/"],
        ],
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      },
    },
  },
};
