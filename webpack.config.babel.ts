import path from "path";
const chalk = require('chalk')
const ProgressBarPlugin = require('progress-bar-webpack-plugin')
import { CleanWebpackPlugin } from "clean-webpack-plugin";
import CopyPlugin from "copy-webpack-plugin";
import htmlWebpackPlugin from "html-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import MonacoLocalesPlugin from "monaco-editor-locales-plugin";
import vueLoaderPlugin from "vue-loader/lib/plugin";

import { Configuration } from "webpack";

const home = __dirname + "/src";

const config: Configuration = {
    entry: {
        background: home + "/background.ts",
        sandbox: home + "/sandbox.ts",
        options: home + "/options.tsx",
        popup: home + "/popup.ts",
        install: home + "/install.ts",
        confirm: home + "/confirm.ts",
        "editor.worker": "monaco-editor/esm/vs/editor/editor.worker.js",
        "ts.worker": "monaco-editor/esm/vs/language/typescript/ts.worker",
    },
    output: {
        path: __dirname + "/build/scriptcat/src",
        filename: "[name].js",
        clean: true,
    },
    plugins: [
        new htmlWebpackPlugin({
            filename: __dirname + "/build/scriptcat/background.html",
            template: __dirname + "/public/background.html",
            inject: "head",
            title: "Background - ScriptCat",
            minify: {
                removeComments: true,
            },
            chunks: ["background"],
        }),
        new htmlWebpackPlugin({
            filename: __dirname + "/build/scriptcat/sandbox.html",
            template: __dirname + "/public/sandbox.html",
            inject: "head",
            title: "Sandbox - ScriptCat",
            minify: {
                removeComments: true,
            },
            chunks: ["sandbox"],
        }),
        new htmlWebpackPlugin({
            filename: __dirname + "/build/scriptcat/options.html",
            template: __dirname + "/public/options.html",
            inject: "head",
            title: "Home - ScriptCat",
            minify: {
                removeComments: true,
            },
            chunks: ["options"],
        }),
        new htmlWebpackPlugin({
            filename: __dirname + "/build/scriptcat/popup.html",
            template: __dirname + "/public/popup.html",
            inject: "head",
            title: "Home - ScriptCat",
            minify: {
                removeComments: true,
            },
            chunks: ["popup"],
        }),
        new htmlWebpackPlugin({
            filename: __dirname + "/build/scriptcat/install.html",
            template: __dirname + "/public/install.html",
            inject: "head",
            title: "Install - ScriptCat",
            minify: {
                removeComments: true,
            },
            chunks: ["install"],
        }),
        new htmlWebpackPlugin({
            filename: __dirname + "/build/scriptcat/confirm.html",
            template: __dirname + "/public/confirm.html",
            inject: "head",
            title: "Confirm - ScriptCat",
            minify: {
                removeComments: true,
            },
            chunks: ["confirm"],
        }),
        new MonacoLocalesPlugin({
            languages: ["es", "zh-cn"],
            defaultLanguage: "zh-cn",
            logUnmatched: false,
        }),
        new MiniCssExtractPlugin({
            linkType: false,
            filename: "[name].[chunkhash:8].css",
            chunkFilename: "[name].[chunkhash:8].chunk.css",
        }),
        new vueLoaderPlugin(),
        new CleanWebpackPlugin({ cleanStaleWebpackAssets: false }),
        new ProgressBarPlugin({
            format: `  :msg [:bar] ${chalk.green.bold(':percent')} (:elapsed s)`
        })
    ],
    resolve: {
        extensions: [".ts", ".tsx", ".js", ".vue", ".d.ts", ".tpl"],
        alias: {
            "@App": path.resolve(__dirname, "src/"),
            "@views": path.resolve(__dirname, "src/views"),
            "@components": path.resolve(__dirname, "src/views/components"),
            "@Option": path.resolve(__dirname, "src/views/pages/Option"),
        },
        fallback: {
            crypto: require.resolve("crypto-browserify"),
            stream: require.resolve("stream-browserify"),
        },
    },
    module: {
        rules: [
            {
                test: /\.vue$/,
                use: "vue-loader",
                exclude: /node_modules/,
            },
            {
                test: /\.vue$/,
                use: "vue-loader",
                include: /node_modules[\\\/]@qvant[\\\/]qui/,
            },
            {
                test: /\.d\.ts$/,
                use: [
                    {
                        loader: "raw-loader",
                    },
                ],
                exclude: /node_modules/,
            },
            {
                test: /\.tpl$/,
                use: [
                    {
                        loader: "raw-loader",
                    },
                ],
                exclude: /node_modules/,
            },
            {
                test: /\.m?js$/,
                exclude: /(node_modules|bower_components)/,
                use: [
                    {
                        loader: "babel-loader",
                    },
                ],
            },
            {
                test: /(?<!\.d)\.tsx?$/,
                use: [
                    "babel-loader",
                    {
                        loader: "ts-loader",
                        options: {
                            appendTsSuffixTo: [/\.vue$/],
                        },
                    },
                ],
                exclude: /node_modules/,
            },
            {
                test: /\.css$/,
                use: [MiniCssExtractPlugin.loader, "css-loader"],
            },
            {
                test: /\.s(c|a)ss$/,
                use: [
                    "vue-style-loader",
                    "css-loader",
                    {
                        loader: "sass-loader",
                        // Requires sass-loader@^8.0.0
                        options: {
                            implementation: require("sass"),
                            sassOptions: {
                                indentedSyntax: true, // optional
                            },
                        },
                    },
                ],
            },
            {
                test: /\.(ttf|eot|svg|woff|woff2)$/,
                use: ["file-loader"],
            },
        ],
    },
};

export default config;
