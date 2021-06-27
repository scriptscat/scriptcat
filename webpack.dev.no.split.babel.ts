import merge from "webpack-merge";
import common from "./webpack.no.split.babel";

export default merge(common, {
    watch: true,
    devtool: "inline-source-map",
});
