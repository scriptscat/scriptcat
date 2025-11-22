/* eslint-disable import/no-extraneous-dependencies */
import path from "path";
import merge from "webpack-merge";
import { configInjectScript as common } from "../webpack.config";

const src = path.resolve(__dirname, "../src");
const dist = path.resolve(__dirname, "../dist");

// 不要分割的文件
common.entry = {
  inject: `${src}/inject.ts`,
};

common.output = {
  path: `${dist}`,
  filename: "[name].js",
  clean: false,
};

export default merge(common, {});
