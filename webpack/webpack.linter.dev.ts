/* eslint-disable import/no-extraneous-dependencies */
import merge from "webpack-merge";
import TerserPlugin from "terser-webpack-plugin";
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
};

common.optimization = {
  minimize: false,
  splitChunks: false,
  runtimeChunk: false,
  minimizer: [
    new TerserPlugin({
      extractComments: false, // 避免额外产生 .LICENSE.txt
      terserOptions: {
        format: {
          // 输出只用 ASCII，非 ASCII 变成 \uXXXX
          ascii_only: true,
        },
      },
    }),
  ],
};

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
