const path = require('path');
const htmlWebpackPlugin = require('html-webpack-plugin');
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
        })
    ],
    resolve: {
        extensions: ['.ts', '.js'],
        alias: {
            "@App": path.resolve(__dirname, 'src/')
        }
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            }
        ]
    }, plugins: [
    ],
}