/* eslint-disable import/no-extraneous-dependencies */
import path from "path";
import NodePolyfillPlugin from "node-polyfill-webpack-plugin";
import merge from "webpack-merge";
import { configWebWorker as common } from "../webpack.config";

const src = path.resolve(__dirname, "../src");
const dist = path.resolve(__dirname, "../dist");

// eslint文件
common.entry = {
  "linter.worker": `${src}/linter.worker.ts`,
};

common.output = {
  globalObject: "self",
  path: path.join(dist, "ext/src"),
  filename: "[name].js",
  clean: false,
};

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
