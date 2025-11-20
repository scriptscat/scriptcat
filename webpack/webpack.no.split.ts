/* eslint-disable import/no-extraneous-dependencies */
import merge from "webpack-merge";
import HtmlWebpackPlugin from "html-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";
import CompressionPlugin from "compression-webpack-plugin";
import { CleanWebpackPlugin } from "clean-webpack-plugin";
import common from "../webpack.config";

const src = `${__dirname}/../src`;
const dist = `${__dirname}/../dist`;

// 不要分割的文件
common.entry = {
  content: `${src}/content.ts`,
  "editor.worker": "monaco-editor/esm/vs/editor/editor.worker.js",
  "ts.worker": "monaco-editor/esm/vs/language/typescript/ts.worker.js",
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
common.plugins = common.plugins!.filter(
  (plugin) =>
    !(
      plugin instanceof HtmlWebpackPlugin ||
      plugin instanceof CopyPlugin ||
      plugin instanceof CleanWebpackPlugin
    )
);

export default merge(common, {
  plugins: [
    // firefox商店文件不能大于4M, 所以需要压缩
    new CompressionPlugin({
      test: /ts.worker.js$/,
      filename: () => "ts.worker.js",
      deleteOriginalAssets: true,
    }),
  ],
});
