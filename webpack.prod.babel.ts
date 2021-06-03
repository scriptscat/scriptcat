import merge from "webpack-merge";
import commonConfig from "./webpack.config.babel";
import TerserPlugin from "terser-webpack-plugin";
import { Configuration } from "webpack";

// split对injected可能会有问题
const localConfig: Configuration = {
    devtool: false,
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin()],
        splitChunks: {
            chunks: "all",
            minSize: 4194304000,
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
                }
            },
        },
    },
};

export default merge(commonConfig, localConfig);
