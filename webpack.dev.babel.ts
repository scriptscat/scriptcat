import merge from "webpack-merge";
import common from "./webpack.config.babel";


const home = __dirname + "/src";

export default merge(common, {
    entry: {
        background: home + "/background.ts",
        sandbox: home + "/sandbox.ts",
        options: home + "/options.tsx",
        popup: home + "/popup.ts",
        install: home + "/install.ts",
        confirm: home + "/confirm.ts",
        content: home + "/content.ts",
        injected: home + "/injected.ts",
        "editor.worker": "monaco-editor/esm/vs/editor/editor.worker.js",
        "ts.worker": "monaco-editor/esm/vs/language/typescript/ts.worker",
    },
    watch: true,
    devtool: "inline-source-map",
});
