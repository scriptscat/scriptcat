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
