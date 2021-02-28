const merge = require('webpack-merge');
const common = require('./webpack.config.js');
const TerserPlugin = require("terser-webpack-plugin");

module.exports = merge(common, {
    devtool: false,
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin()],
        splitChunks: {
            chunks: 'all',
            minSize: 30000,
            maxSize: 1048576,
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
                    name: 'vendor',
                    chunks: 'all',
                },
                default: {
                    minChunks: 2,
                    priority: -20,
                    reuseExistingChunk: true
                }
            }
        }
    },
    plugins: [

    ]
})