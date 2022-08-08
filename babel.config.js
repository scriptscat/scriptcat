module.exports = {
  presets: [
    [
      "@babel/preset-env",
      {
        corejs: {
          version: 3,
        },
        useBuiltIns: "entry",
        targets: { chrome: "68", firefox: "60" },
      },
      "@babel/preset-typescript",
    ],
    "@babel/preset-react",
    "@babel/preset-typescript",
  ],
  plugins: [
    "@babel/plugin-transform-runtime",
    ["@babel/plugin-proposal-decorators", { legacy: true }],
  ],
};
