/* eslint-disable import/no-extraneous-dependencies */
import merge from "webpack-merge";
import CompressionPlugin from "compression-webpack-plugin";
import common from "../webpack.config";

const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const path = require("path");

const src = `${__dirname}/../src`;
const dist = `${__dirname}/../dist`;

common.entry = {
  // @ts-ignore
  ...common.entry,
  content: `${src}/content.ts`,
  inject: `${src}/inject.ts`,
  "editor.worker": "monaco-editor/esm/vs/editor/editor.worker.js",
  "ts.worker": "monaco-editor/esm/vs/language/typescript/ts.worker.js",
  "linter.worker": `${src}/linter.worker.ts`,
};

common.output = {
  path: `${dist}/ext/src`,
  filename: "[name].js",
  clean: false,
};

// 取消splitChunks
common.optimization = {};

export default merge(common, {
  watch: true,
  devtool: "inline-source-map",
  plugins: [
    // firefox商店文件不能大于4M, 所以需要压缩
    new CompressionPlugin({
      test: /ts.worker.js/,
      deleteOriginalAssets: true,
    }),
    new NodePolyfillPlugin(),
  ],
  resolve: {
    mainFields: ["browser", "main", "module"],
    // 改写eslint-plugin-userscripts以适配脚本猫，打包时重定义模块路径
    alias: {
      "../data/compat-grant": path.resolve(__dirname, "../eslint/compat-grant"),
      "../data/compat-headers": path.resolve(
        __dirname,
        "../eslint/compat-headers"
      ),
    },
  },
});
