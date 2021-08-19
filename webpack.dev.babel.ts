import merge from "webpack-merge";
import common from "./webpack.config.babel";


const home = __dirname + "/src";

export default merge(common, {
    watch: true,
    devtool: "inline-source-map",
});
