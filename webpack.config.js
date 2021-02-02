const path = require('path');
const htmlWebpackPlugin = require('html-webpack-plugin');
const vueLoaderPlugin = require('vue-loader/lib/plugin');
const home = __dirname + '/src';
module.exports = {
    entry: {
        background: home + '/apps/background.ts',
        options: home + '/apps/options.ts',
    },
    output: {
        path: __dirname + '/build/scriptcat/src',
        filename: '[name].js'
    },
    plugins: [
        new htmlWebpackPlugin({
            filename: __dirname + '/build/scriptcat/options.html',
            template: home + '/options.html',
            inject: 'head',
            title: 'ScriptCat',
            minify: {
                removeComments: true
            },
            chunks: ['options']
        }),
        new vueLoaderPlugin()
    ],
    resolve: {
        extensions: ['.ts', '.js', '.vue'],
        alias: {
            "@App": path.resolve(__dirname, 'src/')
        }
    },
    module: {
        rules: [{
            test: /\.vue$/,
            use: 'vue-loader',
            exclude: /node_modules/,
        }, {
            test: /\.ts$/,
            use: [{
                loader: "ts-loader",
                options: {
                    appendTsSuffixTo: [/\.vue$/],
                },
            }],
            exclude: /node_modules/,
        }, {
            test: /\.css$/,
            use: ['style-loader', 'css-loader'],
            exclude: /node_modules/,
        }]
    }
}