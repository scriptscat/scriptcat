import { version } from "../../package.json";

export const ExtVersion = version;

// agent 入口开关，构建时由 process.env.SC_DISABLE_AGENT 注入：默认开启，正式版打包时屏蔽。
export const EnableAgent = process.env.SC_DISABLE_AGENT !== "true";
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
