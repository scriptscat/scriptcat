/* eslint-disable import/no-extraneous-dependencies */
import path from "path";
import NodePolyfillPlugin from "node-polyfill-webpack-plugin";
import merge from "webpack-merge";
import CopyPlugin from "copy-webpack-plugin";
import { configCommon as common } from "../webpack.config";

const src = path.resolve(__dirname, "../src");
const dist = path.resolve(__dirname, "../dist");
const assets = path.resolve(__dirname, "../build/assets");

common.entry = {
  // @ts-ignore
  ...common.entry,
  content: `${src}/content.ts`,
  "editor.worker": "monaco-editor/esm/vs/editor/editor.worker.js",
  "ts.worker": "monaco-editor/esm/vs/language/typescript/ts.worker.js",
  "linter.worker": `${src}/linter.worker.ts`,
};

common.output = {
  path: path.join(dist, "ext/src"),
  filename: "[name].js",
  clean: false,
};

common.optimization = {
  minimize: false,
  splitChunks: false,
  runtimeChunk: false,
};

export default merge(common, {
  watch: true,
  devtool: "inline-source-map",
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: `${src}/manifest.json`,
          to: `${dist}/ext`,
          // 将manifest.json内版本号替换为package.json中版本号
          transform(content) {
            return content
              .toString()
              .replace(`"name": "ScriptCat"`, `"name": "ScriptCat - Dev"`);
          },
        },
        {
          from: `${assets}/logo-beta.png`,
          to: `${dist}/ext/assets/logo.png`,
        },
      ],
    }),
    new NodePolyfillPlugin(),
  ],
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
