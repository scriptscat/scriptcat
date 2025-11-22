module.exports = {
  presets: [
    [
      "@babel/preset-env",
      {
        corejs: 3,
        useBuiltIns: "entry",
        targets: { esmodules: true }, // modern browsers (all ES2015+)
        // targets: "> 0.1%, last 2 versions, Firefox ESR, not dead",
        bugfixes: true, // for tiny browser specific fixes
        // modules: false, // for webpack
      },
    ],
    "@babel/preset-react",
    "@babel/preset-typescript",
  ],
  plugins: [
    "@babel/plugin-transform-runtime", // helpers only, no corejs here
    ["@babel/plugin-proposal-decorators", { legacy: true }], // only if you use them
  ],
};
