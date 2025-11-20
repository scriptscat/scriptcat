/* eslint-disable import/no-extraneous-dependencies */
import merge from "webpack-merge";
import common from "../webpack.config";

const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");

const src = `${__dirname}/../src`;
const dist = `${__dirname}/../dist`;

// eslint文件
common.entry = {
  "linter.worker": `${src}/linter.worker.ts`,
};

common.output = {
  path: `${dist}/ext/src`,
  filename: "[name].js",
  clean: false,
  // min versions: Chrome 62, Firefox 57, Safari 11.1, Edge 79 (ES2015+)
  environment: {
    // The environment supports arrow functions ('() => { ... }').
    arrowFunction: true,
    // The environment supports async function and await ('async function () { await ... }').
    asyncFunction: true,
    // The environment supports const and let for variable declarations.
    const: true,
    // The environment supports destructuring ('{ a, b } = obj').
    destructuring: true,
    // The environment supports 'for of' iteration ('for (const x of array) { ... }').
    forOf: true,
    // The environment supports template literals.
    templateLiteral: true,
  }
};

// 取消splitChunks
common.optimization = {};

// 移除插件
common.plugins = [];

export default merge(common, {
  watch: true,
  devtool: "inline-source-map",
  plugins: [new NodePolyfillPlugin()],
  resolve: {
    mainFields: ["browser", "main", "module"],
  },
});
