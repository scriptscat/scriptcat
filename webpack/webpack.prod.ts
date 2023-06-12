/* eslint-disable import/no-extraneous-dependencies */
import merge from "webpack-merge";
import { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";
import CopyPlugin from "copy-webpack-plugin";
import common from "../webpack.config";

const src = `${__dirname}/../src`;
const dist = `${__dirname}/../dist`;
const assets = `${__dirname}/../build/assets`;

export default merge(common, {
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: `${src}/manifest.json`,
          to: `${dist}/ext`,
          // 将manifest.json内版本号替换为package.json中版本号
          transform(content) {
            return content.toString();
          },
        },
        {
          from: `${assets}/logo.png`,
          to: `${dist}/ext/assets/logo.png`,
        },
      ],
    }),
    new BundleAnalyzerPlugin({
      analyzerMode: "static",
      openAnalyzer: false,
      reportFilename: "../../report/bundle-analyzer.html",
    }),
  ],
});
