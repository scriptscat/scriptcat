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
