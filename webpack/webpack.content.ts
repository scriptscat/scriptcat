/* eslint-disable import/no-extraneous-dependencies */
import path from "path";
import merge from "webpack-merge";
import { configInjectScript as common } from "../webpack.config";

const src = path.resolve(__dirname, "../src");
const dist = path.resolve(__dirname, "../dist");

// 不要分割的文件
common.entry = {
  content: path.join(src, "content.ts"),
};

common.output = {
  path: path.join(dist, "ext/src"),
  filename: "[name].js",
  clean: false,
};

export default merge(common, {});
