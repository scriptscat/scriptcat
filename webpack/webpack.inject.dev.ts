/* eslint-disable import/no-extraneous-dependencies */
import merge from "webpack-merge";
import HtmlWebpackPlugin from "html-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";
import { CleanWebpackPlugin } from "clean-webpack-plugin";
import common from "../webpack.config";

const src = `${__dirname}/../src`;
const dist = `${__dirname}/../dist`;

// 不要分割的文件
common.entry = {
  inject: `${src}/inject.ts`,
};

common.output = {
  path: `${dist}`,
  filename: "[name].js",
  clean: false,
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
  watch: true,
  devtool: "inline-source-map",
});
