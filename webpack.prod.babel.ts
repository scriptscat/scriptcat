/*
 * @Author: ScriptCat
 * @Date: 2021-09-03 01:11:14
 * @LastEditTime: 2021-09-04 22:37:33
 * @LastEditors: Przeblysk
 * @Description: 
 * @FilePath: /scriptcat/webpack.prod.babel.ts
 * 
 */

import merge from "webpack-merge";
import commonConfig from "./webpack.config.babel";
import TerserPlugin from "terser-webpack-plugin";
import { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";
import CssMinimizerPlugin from 'css-minimizer-webpack-plugin';
import { Configuration } from "webpack";

// 减小扩展包大小
const localConfig: Configuration = {
    devtool: false,
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin(), new CssMinimizerPlugin()],
        splitChunks: {
            chunks: "all",
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
                    minSize: 3000,
                    maxSize: 4194304,
                    name: "vendor",
                    chunks: "all",
                    priority: 0,
                    reuseExistingChunk: true,
                }
            },
        },
    },
    plugins: [
        new BundleAnalyzerPlugin({
            analyzerMode: "static",
            openAnalyzer: false,
            reportFilename: "../../report/bundle-analyzer.html",
        }),
    ],
};

export default merge(commonConfig, localConfig);
