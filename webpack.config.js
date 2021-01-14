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
        extensions: ['.ts', '.js']
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