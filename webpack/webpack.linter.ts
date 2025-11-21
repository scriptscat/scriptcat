/* eslint-disable import/no-extraneous-dependencies */
import merge from "webpack-merge";
import TerserPlugin from "terser-webpack-plugin";
import common from "../webpack.config";

const path = require("path");
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
  minimize: true,
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
  plugins: [new NodePolyfillPlugin()],
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
