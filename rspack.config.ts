import * as path from "path";
import { defineConfig } from "@rspack/cli";
import { rspack } from "@rspack/core";
import { readFileSync } from "fs";
import { NormalModule } from "@rspack/core";
import { v4 as uuidv4 } from "uuid";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

const version = pkg.version;
const dirname = path.resolve();
const isDev = process.env.NODE_ENV === "development";
const isBeta = version.includes("-");

// Target browsers, see: https://github.com/browserslist/browserslist
const targets = ["chrome >= 87", "edge >= 88", "firefox >= 78", "safari >= 14"];

const src = path.join(dirname, "src");
const dist = path.join(dirname, "dist");
const assets = path.join(src, "assets");

// 排除这些文件，不进行分离
const chunkExcludeSet = new Set([
  "editor.worker",
  "ts.worker",
  "linter.worker",
  "service_worker",
  "content",
  "inject",
  "scripting",
]);

export default defineConfig({
  ...(isDev
    ? {
        watch: true,
        mode: "development",
        devtool: process.env.NO_MAP === "true" ? false : "inline-source-map",
      }
    : {
        mode: "production",
        devtool: false,
      }),
  context: dirname,
  entry: {
    service_worker: `${src}/service_worker.ts`,
    offscreen: `${src}/offscreen.ts`,
    sandbox: `${src}/sandbox.ts`,
    content: `${src}/content.ts`,
    scripting: `${src}/scripting.ts`,
    inject: `${src}/inject.ts`,
    popup: `${src}/pages/popup/main.tsx`,
    install: `${src}/pages/install/main.tsx`,
    batchupdate: `${src}/pages/batchupdate/main.tsx`,
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
      "@App": path.resolve(dirname, "src/"),
      "@Packages": path.resolve(dirname, "packages/"),
      // 改写eslint-plugin-userscripts以适配脚本猫，打包时重定义模块路径
      "../data/compat-grant": path.resolve(dirname, "packages/eslint/compat-grant"),
      "../data/compat-headers": path.resolve(dirname, "packages/eslint/compat-headers"),
    },
    fallback: {
      child_process: false,
    },
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        type: "css/auto",
        use: ["postcss-loader"],
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
                externalHelpers: true,
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
        test: /\.tpl$/,
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new rspack.DefinePlugin({
      "process.env.VI_TESTING": "'false'",
      "process.env.SC_RANDOM_KEY": `'${uuidv4()}'`,
    }),
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
        {
          from: `${assets}/logo${isDev || isBeta ? "-beta" : ""}-32.png`,
          to: `${dist}/ext/assets/logo-32.png`,
        },
        { from: `${assets}/logo-gray.png`, to: `${dist}/ext/assets/logo-gray.png` },
        { from: `${assets}/logo-gray-32.png`, to: `${dist}/ext/assets/logo-gray-32.png` },
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
      filename: `${dist}/ext/src/batchupdate.html`,
      template: `${src}/pages/template.html`,
      inject: "head",
      title: "BatchUpdate - ScriptCat",
      minify: true,
      chunks: ["batchupdate"],
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
  ].filter(Boolean),
  experiments: {
    css: true,
    parallelCodeSplitting: true,
    parallelLoader: true,
  },
  optimization: {
    minimizer: [
      new rspack.SwcJsMinimizerRspackPlugin({
        minimizerOptions: {
          minify: !isDev,
          mangle: {
            keep_classnames: false,
            keep_fnames: false,
            keep_private_props: false,
            ie8: false,
            toplevel: true,
          },
          module: true,
          compress: {
            passes: 2,
            drop_console: false,
            drop_debugger: !isDev,
            ecma: 2020,
            arrows: true,
            dead_code: true,
            ie8: false,
            keep_classnames: false,
            keep_fargs: false,
            keep_fnames: false,
            toplevel: true,
            sequences: true,
            hoist_props: false,
            hoist_vars: false,
            reduce_funcs: true,
            reduce_vars: true,
            pure_getters: "strict",
          },
          format: {
            comments: false,
            beautify: false,
            ecma: 2020,
          },
        },
      }),
      new rspack.LightningCssMinimizerRspackPlugin({
        minimizerOptions: { targets },
      }),
    ],
    removeAvailableModules: true,
    removeEmptyChunks: true,
    realContentHash: true,
    sideEffects: true,
    providedExports: true,
    concatenateModules: true,
    avoidEntryIife: true,
    mergeDuplicateChunks: true,
    splitChunks: {
      minChunks: 1,
      maxAsyncRequests: 30,
      maxInitialRequests: 30,
      minSize: {
        javascript: 40 * 1024, // 40 kB
        css: 10 * 1024, // 10 kB
      },
      maxSize: {
        javascript: 2 * 1024 * 1024, // 2 MB
        css: 2 * 1024 * 1024, // 2 MB
      },
      chunks: (chunk) => !chunkExcludeSet.has(chunk.name || ""),
      hidePathInfo: false,
      name: (module, _ctx) => {
        if (module instanceof NormalModule) {
          const p = `/${module.rawRequest}|/${module.resource}`.toLowerCase().replace(/[\\@/]+/g, "/");
          if (p.startsWith("/packages/message/")) return "lib_message";
          if (module.type === "json" && p.includes("translation.json")) return "translation_json";
          let tag = "";
          const idx = p.indexOf("/node_modules/");
          if (idx >= 0) {
            let q = p.replace(/\.pnpm\/?/g, "");
            q = q.substring(idx);
            q = q.replace(/\..*/, "");
            tag = q.split("/")[2] || "";
          }
          if (module.type !== "css" && tag === "monaco-editor") return "lib_monaco";
          switch (tag) {
            case "react-icons":
              if (p.includes("/react-icons/tb")) return undefined;
            // eslint-disable-next-line no-fallthrough
            case "react-dropzone":
            case "react-dom":
            case "react-i18next":
            case "react-router-dom":
            case "react-joyride":
            case "react":
              return `lib_${tag}`;
          }
          if (tag.startsWith("dnd-kit")) return "lib_dnd-kit";
          if (tag.startsWith("popper")) return "lib_react-joyride";
          if (tag.startsWith("react-")) return "lib_react";
          if (tag.startsWith("eslint")) return "lib_eslint";
          if (tag.startsWith("i18n")) return "lib_i18n";
          if (
            tag.startsWith("arco-design") ||
            tag === "resize-observer-polyfill" ||
            tag === "b-validate" ||
            tag === "lodash" ||
            tag === "focus-lock"
          ) {
            return "lib_arco_design";
          }
          if (tag) {
            // cron, dayjs, yaml, jszip, prettier, ...
            if (tag === "luxon") return "lib_cron";
            return `lib_${tag}`;
          }
          return "chunk";
        }
      },
    },
  },
});
