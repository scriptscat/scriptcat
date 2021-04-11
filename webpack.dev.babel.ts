import merge from "webpack-merge";
import common from "./webpack.config.babel";

export default merge(common, {
    watch: true,
    devtool: "inline-source-map",
});
