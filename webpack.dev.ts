/* eslint-disable import/no-extraneous-dependencies */
import merge from "webpack-merge";
import common from "./webpack.config";

common.optimization = {};
export default merge(common, {
  watch: true,
  devtool: "inline-source-map",
});
