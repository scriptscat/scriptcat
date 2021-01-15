const path = require('path');
const home = __dirname + '/src';
module.exports = {
    entry: {
        background: home + '/apps/background.ts',
    },
    output: {
        path: __dirname + '/build/scriptcat/src',
        filename: '[name].js'
    },
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