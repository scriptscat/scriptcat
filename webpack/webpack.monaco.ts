/* eslint-disable import/no-extraneous-dependencies */
import path from "path";
import merge from "webpack-merge";
import { configWebWorker as common } from "../webpack.config";

// const src = path.resolve(__dirname, "../src");
const dist = path.resolve(__dirname, "../dist");

// 不要分割的文件
common.entry = {
  "editor.worker": "monaco-editor/esm/vs/editor/editor.worker.js",
  "ts.worker": "monaco-editor/esm/vs/language/typescript/ts.worker.js",
};

common.output = {
  globalObject: "self",
  path: path.join(dist, "ext/src"),
  filename: "[name].js",
  clean: false,
};

export default merge(common, {});
