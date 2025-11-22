/* eslint-disable import/no-extraneous-dependencies */
import path from "path";
import NodePolyfillPlugin from "node-polyfill-webpack-plugin";
import merge from "webpack-merge";
import TerserPlugin from "terser-webpack-plugin";
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
  watch: true,
  devtool: "inline-source-map",
  plugins: [new NodePolyfillPlugin()],
  resolve: {
    mainFields: ["browser", "main", "module"],
  },
});
