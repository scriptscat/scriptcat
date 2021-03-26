import merge from "webpack-merge";
import commonConfig from "./webpack.config.babel";
import TerserPlugin from "terser-webpack-plugin";
import { Configuration } from "webpack";

const localConfig: Configuration = {
    devtool: false,
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin()],
        splitChunks: {
            chunks: "all",
            minSize: 307200,
            maxSize: 4194304,
            cacheGroups: {
                monaco: {
                    test: /[\\/]node_modules[\\/]monaco-editor/,
                    name: "monaco",
                    chunks: "all",
                    priority: 1,
                },
                vendors: {
                    test: /[\\/]node_modules[\\/]/,
                    priority: -10,
                    name: "vendor",
                    chunks: "all",
                },
                default: {
                    minChunks: 2,
                    priority: -20,
                    reuseExistingChunk: true,
                },
            },
        },
    },
    plugins: [],
};

export default merge(commonConfig, localConfig);
