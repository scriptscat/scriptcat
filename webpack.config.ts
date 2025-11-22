/* eslint-disable import/no-extraneous-dependencies */
import path from "path";
import { Configuration } from "webpack";
import TerserPlugin from "terser-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import ESLintPlugin from "eslint-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";
import { CleanWebpackPlugin } from "clean-webpack-plugin";
import { presetAttributify, presetUno } from "unocss";
import UnoCSS from "@unocss/webpack";

const ProgressBarPlugin = require("progress-bar-webpack-plugin");
const MonacoLocalesPlugin = require("monaco-editor-locales-plugin");

const src = `${__dirname}/src`;
const dist = `${__dirname}/dist`;
const assets = `${__dirname}/build/assets`;
const template = `${assets}/template`;

const configCommon: Configuration = {
  entry: {
    options: `${src}/pages/options/main.tsx`,
    install: `${src}/pages/install/main.tsx`,
    background: `${src}/background.ts`,
    sandbox: `${src}/sandbox.ts`,
    popup: `${src}/pages/popup/main.tsx`,
    confirm: `${src}/pages/confirm/main.tsx`,
    import: `${src}/pages/import/main.tsx`,
  },
  output: {
    path: `${dist}/ext/src`,
    filename: "[name].js",
    clean: true,
    // min versions: Chrome 62, Firefox 57, Safari 11.1, Edge 79 (ES2015+)
    environment: {
      // The environment supports arrow functions ('() => { ... }').
      arrowFunction: true,
      // The environment supports async function and await ('async function () { await ... }').
      asyncFunction: true,
      // The environment supports const and let for variable declarations.
      const: true,
      // The environment supports destructuring ('{ a, b } = obj').
      destructuring: true,
      // The environment supports 'for of' iteration ('for (const x of array) { ... }').
      forOf: true,
      // The environment supports template literals.
      templateLiteral: true,
    }
  },
  plugins: [
    new HtmlWebpackPlugin({
      filename: `${dist}/ext/src/options.html`,
      template: `${template}/options.html`,
      inject: "head",
      title: "Home - ScriptCat",
      minify: {
        removeComments: true,
      },
      chunks: ["options"],
    }),
    new HtmlWebpackPlugin({
      filename: `${dist}/ext/src/install.html`,
      template: `${template}/install.html`,
      inject: "head",
      title: "Install - ScriptCat",
      minify: {
        removeComments: true,
      },
      chunks: ["install"],
    }),
    new HtmlWebpackPlugin({
      filename: `${dist}/ext/src/sandbox.html`,
      template: `${template}/sandbox.html`,
      inject: "head",
      title: "ScriptCat",
      minify: {
        removeComments: true,
      },
      chunks: ["sandbox"],
    }),
    new HtmlWebpackPlugin({
      filename: `${dist}/ext/src/popup.html`,
      template: `${template}/popup.html`,
      inject: "head",
      title: "ScriptCat",
      minify: {
        removeComments: true,
      },
      chunks: ["popup"],
    }),
    new HtmlWebpackPlugin({
      filename: `${dist}/ext/src/background.html`,
      template: `${template}/background.html`,
      inject: "head",
      title: "ScriptCat",
      minify: {
        removeComments: true,
      },
      chunks: ["background"],
      scriptLoading: "blocking",
    }),
    new HtmlWebpackPlugin({
      filename: `${dist}/ext/src/confirm.html`,
      template: `${template}/confirm.html`,
      inject: "head",
      title: "Confirm - ScriptCat",
      minify: {
        removeComments: true,
      },
      chunks: ["confirm"],
    }),
    new HtmlWebpackPlugin({
      filename: `${dist}/ext/src/import.html`,
      template: `${template}/import.html`,
      inject: "head",
      title: "Import - ScriptCat",
      minify: {
        removeComments: true,
      },
      chunks: ["import"],
    }),
    new ESLintPlugin({
      extensions: [".ts", ".tsx"],
    }),
    new CopyPlugin({
      patterns: [
        { from: `${assets}/_locales`, to: `${dist}/ext/_locales` },
        { from: `${assets}/logo`, to: `${dist}/ext/assets/logo` },
      ],
    }),
    new CleanWebpackPlugin(),
    new ProgressBarPlugin({}),
    new MonacoLocalesPlugin({
      languages: ["en", "zh-cn"],
      defaultLanguage: "en",
      logUnmatched: false,
    }),
    UnoCSS({
      presets: [presetUno(), presetAttributify()],
    }),
  ],
  resolve: {
    extensions: [".js", ".ts", ".tsx", ".d.ts", ".tpl", ".json"],
    alias: {
      "@App": path.resolve(__dirname, "src/"),
      "@Pkg": path.resolve(__dirname, "pkg/"),
    },
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)?$/,
        use: ["babel-loader"],
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.d\.ts$/,
        use: ["raw-loader"],
        exclude: /node_modules/,
      },
      {
        test: /inject\.js$/,
        use: ["raw-loader"],
        include: /dist/,
      },
      {
        test: /\.tpl$/,
        use: ["raw-loader"],
        exclude: /node_modules/,
      },
    ],
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: false, // 避免额外产生 .LICENSE.txt
      }),
    ],
    splitChunks: {
      chunks: "all",
      minSize: 307200,
      maxSize: 4194304,
      cacheGroups: {
        monaco: {
          test: /[\\/]node_modules[\\/]monaco-editor/,
          minSize: 307200,
          maxSize: 4194304,
          name: "monaco",
          chunks: "all",
          priority: 1,
          reuseExistingChunk: true,
        },
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          minSize: 307200,
          maxSize: 4194304,
          name: "vendor",
          chunks: "all",
          priority: 0,
          reuseExistingChunk: true,
        },
      },
    },
  },
};

const configWebWorker: Configuration = {
  ...configCommon,

  optimization: {
    minimize: true,
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
  },
  
  // 移除插件
  plugins: [],
} satisfies Configuration;

const configInjectScript: Configuration = {
  ...configCommon,

  optimization: {
    minimize: true,
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
  },
  
  // 移除插件
  plugins: configCommon.plugins!.filter(
    (plugin) =>
      !(
        plugin instanceof HtmlWebpackPlugin ||
        plugin instanceof CopyPlugin ||
        plugin instanceof CleanWebpackPlugin
      )
  ),

} satisfies Configuration;



export { configCommon, configWebWorker, configInjectScript };
