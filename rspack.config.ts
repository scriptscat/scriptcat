import * as path from "path";
import { defineConfig } from "@rspack/cli";
import { rspack } from "@rspack/core";
import { version } from "./package.json";

const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");

const isDev = process.env.NODE_ENV === "development";
const isBeta = version.includes("-");

// Target browsers, see: https://github.com/browserslist/browserslist
const targets = ["chrome >= 87", "edge >= 88", "firefox >= 78", "safari >= 14"];

const src = `${__dirname}/src`;
const dist = `${__dirname}/dist`;
const assets = `${src}/assets`;

export default defineConfig({
  ...(isDev
    ? {
        watch: true,
        mode: "development",
        devtool: "inline-source-map",
      }
    : {
        mode: "production",
        devtool: false,
      }),
  context: __dirname,
  entry: {
    service_worker: `${src}/service_worker.ts`,
    offscreen: `${src}/offscreen.ts`,
    sandbox: `${src}/sandbox.ts`,
    content: `${src}/content.ts`,
    inject: `${src}/inject.ts`,
    popup: `${src}/pages/popup/main.tsx`,
    install: `${src}/pages/install/main.tsx`,
    confirm: `${src}/pages/confirm/main.tsx`,
    import: `${src}/pages/import/main.tsx`,
    options: `${src}/pages/options/main.tsx`,
    "editor.worker": "monaco-editor/esm/vs/editor/editor.worker.js",
    "ts.worker": "monaco-editor/esm/vs/language/typescript/ts.worker.js",
    "linter.worker": `${src}/linter.worker.ts`,
  },
  output: {
    path: `${dist}/ext/src`,
    filename: "[name].js",
    clean: true,
  },
  resolve: {
    extensions: ["...", ".ts", ".tsx", ".jsx"],
    alias: {
      "@App": path.resolve(__dirname, "src/"),
      "@Packages": path.resolve(__dirname, "packages/"),
      // 改写eslint-plugin-userscripts以适配脚本猫，打包时重定义模块路径
      "../data/compat-grant": path.resolve(__dirname, "./packages/eslint/compat-grant"),
      "../data/compat-headers": path.resolve(__dirname, "./packages/eslint/compat-headers"),
    },
    fallback: {
      child_process: false,
    },
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          {
            loader: "postcss-loader",
            options: {
              postcssOptions: {
                plugins: {
                  autoprefixer: {},
                },
              },
            },
          },
        ],
        type: "css",
      },
      {
        test: /\.(svg|png)$/,
        type: "asset",
      },
      {
        test: /\.(jsx?|tsx?)$/,
        use: [
          {
            loader: "builtin:swc-loader",
            options: {
              jsc: {
                parser: {
                  syntax: "typescript",
                  tsx: true,
                  decorators: true,
                },
                transform: {
                  react: {
                    runtime: "automatic",
                    development: isDev,
                  },
                },
              },
              env: { targets },
            },
          },
        ],
      },
      {
        type: "asset/source",
        test: /\.d\.ts$/,
        exclude: /node_modules/,
      },
      {
        type: "asset/source",
        test: /\.tpl$/,
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new rspack.CopyRspackPlugin({
      patterns: [
        {
          from: `${src}/manifest.json`,
          to: `${dist}/ext`,
          // 将manifest.json内版本号替换为package.json中版本号
          transform(content: Buffer) {
            const manifest = JSON.parse(content.toString());
            if (isDev || isBeta) {
              manifest.name = "__MSG_scriptcat_beta__";
              // manifest.content_security_policy = "script-src 'self' https://cdn.crowdin.com; object-src 'self'";
            }
            return JSON.stringify(manifest);
          },
        },
        {
          from: `${assets}/logo${isDev || isBeta ? "-beta" : ""}.png`,
          to: `${dist}/ext/assets/logo.png`,
        },
        { from: `${assets}/logo`, to: `${dist}/ext/assets/logo` },
        {
          from: `${assets}/_locales`,
          to: `${dist}/ext/_locales`,
        },
      ],
    }),
    new rspack.HtmlRspackPlugin({
      filename: `${dist}/ext/src/install.html`,
      template: `${src}/pages/template.html`,
      inject: "head",
      title: "Install - ScriptCat",
      minify: true,
      chunks: ["install"],
    }),
    new rspack.HtmlRspackPlugin({
      filename: `${dist}/ext/src/confirm.html`,
      template: `${src}/pages/template.html`,
      inject: "head",
      title: "Confirm - ScriptCat",
      minify: true,
      chunks: ["confirm"],
    }),
    new rspack.HtmlRspackPlugin({
      filename: `${dist}/ext/src/import.html`,
      template: `${src}/pages/template.html`,
      inject: "head",
      title: "Import - ScriptCat",
      minify: true,
      chunks: ["import"],
    }),
    new rspack.HtmlRspackPlugin({
      filename: `${dist}/ext/src/options.html`,
      template: `${src}/pages/options.html`,
      inject: "head",
      title: "Home - ScriptCat",
      minify: true,
      chunks: ["options"],
    }),
    new rspack.HtmlRspackPlugin({
      filename: `${dist}/ext/src/popup.html`,
      template: `${src}/pages/popup.html`,
      inject: "head",
      title: "Home - ScriptCat",
      minify: true,
      chunks: ["popup"],
    }),
    new rspack.HtmlRspackPlugin({
      filename: `${dist}/ext/src/offscreen.html`,
      template: `${src}/pages/offscreen.html`,
      inject: "head",
      minify: true,
      chunks: ["offscreen"],
    }),
    new rspack.HtmlRspackPlugin({
      filename: `${dist}/ext/src/sandbox.html`,
      template: `${src}/pages/sandbox.html`,
      inject: "head",
      minify: true,
      chunks: ["sandbox"],
    }),
    new NodePolyfillPlugin(),
  ].filter(Boolean),
  optimization: {
    minimizer: [
      new rspack.SwcJsMinimizerRspackPlugin({}),
      new rspack.LightningCssMinimizerRspackPlugin({
        minimizerOptions: { targets },
      }),
    ],
  },
  experiments: {
    css: true,
  },
});
