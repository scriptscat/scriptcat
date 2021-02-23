const path = require('path');
const htmlWebpackPlugin = require('html-webpack-plugin');
const vueLoaderPlugin = require('vue-loader/lib/plugin');
const MonacoEditorPlugin = require('monaco-editor-webpack-plugin');
const MonacoLocalesPlugin = require('monaco-editor-locales-plugin');
const home = __dirname + '/src';
module.exports = {
    entry: {
        background: home + '/background.ts',
        sandbox: home + '/sandbox.ts',
        options: home + '/options.ts',
        install: home + '/install.ts',
    },
    output: {
        path: __dirname + '/build/scriptcat/src',
        filename: '[name].js'
    },
    plugins: [
        new htmlWebpackPlugin({
            filename: __dirname + '/build/scriptcat/background.html',
            template: __dirname + '/public/background.html',
            inject: 'head',
            title: 'Background - ScriptCat',
            minify: {
                removeComments: true
            },
            chunks: ['background']
        }),
        new htmlWebpackPlugin({
            filename: __dirname + '/build/scriptcat/sandbox.html',
            template: __dirname + '/public/sandbox.html',
            inject: 'head',
            title: 'Sandbox - ScriptCat',
            minify: {
                removeComments: true
            },
            chunks: ['sandbox']
        }),
        new htmlWebpackPlugin({
            filename: __dirname + '/build/scriptcat/options.html',
            template: __dirname + '/public/options.html',
            inject: 'head',
            title: 'Home - ScriptCat',
            minify: {
                removeComments: true
            },
            chunks: ['options']
        }),
        new htmlWebpackPlugin({
            filename: __dirname + '/build/scriptcat/install.html',
            template: __dirname + '/public/install.html',
            inject: 'head',
            title: 'Install - ScriptCat',
            minify: {
                removeComments: true
            },
            chunks: ['install']
        }),
        new MonacoEditorPlugin({
            languages: ['javascript', 'typescript'],
        }),
        new MonacoLocalesPlugin({
            languages: ["es", "zh-cn"],
            defaultLanguage: "zh-cn",
            logUnmatched: false,
        }),
        new vueLoaderPlugin()
    ],
    resolve: {
        extensions: ['.ts', '.js', '.vue', '.d.ts'],
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
            test: /\.d\.ts$/,
            use: [{
                loader: "raw-loader",
            }],
            exclude: /node_modules/,
        }, {
            test: /(?<!\.d)\.ts$/,
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
        }, {
            test: /\.ttf$/,
            use: ['file-loader']
        }]
    }
}