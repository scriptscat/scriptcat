/* eslint-disable import/no-extraneous-dependencies */
import merge from "webpack-merge";
import { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";
import common from "./webpack.config";

export default merge(common, {
  plugins: [
    new BundleAnalyzerPlugin({
      analyzerMode: "static",
      openAnalyzer: false,
      reportFilename: "../../report/bundle-analyzer.html",
    }),
  ],
});
