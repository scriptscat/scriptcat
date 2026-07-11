import { version } from "../../package.json";

export const ExtVersion = version;

// agent 入口开关，构建时由 process.env.SC_DISABLE_AGENT 注入：默认开启，正式版打包时屏蔽。
export const EnableAgent = process.env.SC_DISABLE_AGENT !== "true";

// MCP 桥接开关，构建时由 process.env.SC_ENABLE_MCP 注入：默认关闭，仅 developer 构建显式开启。
// 与 EnableAgent 极性相反 —— MCP 即使在本地开发构建下也需要显式选择加入。
export const EnableMCP = process.env.SC_ENABLE_MCP === "true";
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
