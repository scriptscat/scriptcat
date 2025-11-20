module.exports = {
  presets: [
    [
      "@babel/preset-env",
      {
        corejs: {
          version: 3,
        },
        useBuiltIns: "entry",
        targets: "> 0.1%, last 2 versions, Firefox ESR, not dead",
        bugfixes: true, // for tiny browser specific fixes
        modules: false, // for webpack
        // min versions: Chrome 62, Firefox 57, Safari 11.1, Edge 79 (ES2015+)
        exclude: [
          "@babel/plugin-transform-template-literals",
          "@babel/plugin-transform-arrow-functions",
          "@babel/plugin-transform-classes",
          "@babel/plugin-transform-async-to-generator",
          "@babel/plugin-transform-regenerator",
          "@babel/plugin-transform-for-of",
          "@babel/plugin-transform-block-scoping",
          "@babel/plugin-transform-spread",
          "@babel/plugin-transform-destructuring",
          "@babel/plugin-transform-computed-properties",
          "@babel/plugin-transform-shorthand-properties",
          "@babel/plugin-transform-duplicate-keys",
          "@babel/plugin-transform-literals",
          "@babel/plugin-transform-member-expression-literals",
          "@babel/plugin-transform-property-literals",
        ],
      },
    ],
    "@babel/preset-react",
    "@babel/preset-typescript",
  ],
  plugins: [
    "@babel/plugin-transform-runtime",
    ["@babel/plugin-proposal-decorators", { legacy: true }],
  ],
};
