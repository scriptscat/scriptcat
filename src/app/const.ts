import { version } from "../../package.json";

export const ExtVersion = version;

// agent 功能仅在开发版与 beta 版本提供，正式版本屏蔽相关入口。
// 由打包变量 process.env.SC_ENABLE_AGENT 注入（见 rspack.config.ts / scripts/build-config.js）。
export const EnableAgent = process.env.SC_ENABLE_AGENT === "true";
export const Discord = "https://discord.gg/JF76nHCCM7";
export const DocumentationSite = "https://docs.scriptcat.org";

export const ExtServer = "https://ext.scriptcat.org/";
export const ExtServerApi = ExtServer + "api/v1/";

export const ExternalWhitelist = [
  "scriptcat.org",
  "greasyfork.org",
  "sleazyfork.org",
  "tampermonkey.net.cn",
  "openuserjs.org",
];
