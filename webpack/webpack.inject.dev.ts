/* eslint-disable import/no-extraneous-dependencies */
import path from "path";
import merge from "webpack-merge";
import HtmlWebpackPlugin from "html-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";
import { CleanWebpackPlugin } from "clean-webpack-plugin";
import TerserPlugin from "terser-webpack-plugin";
import common from "../webpack.config";

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
