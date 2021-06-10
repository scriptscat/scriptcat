import path from "path";

// 不要split的文件的打包配置,injected和content

import { Configuration } from "webpack";

const home = __dirname + "/src";

const config: Configuration = {
    entry: {
        content: home + "/content.ts",
        injected: home + "/injected.ts",
    },
    output: {
        path: __dirname + "/build/scriptcat/src",
        filename: "[name].js",
    },
    devtool: false,
    plugins: [],
    resolve: {
        extensions: [".ts", ".js"],
        alias: {
            "@App": path.resolve(__dirname, "src/"),
        }
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            }
        ],
    },
};

export default config;
