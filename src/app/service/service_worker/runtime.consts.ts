export const DefinedFlags = {
  // content 环境flag
  contentFlag: ".ct",
  // inject 环境flag
  injectFlag: ".fd",
  // 脚本加载完成事件
  scriptLoadComplete: ".slc",
  // 环境加载完成事件
  envLoadComplete: ".elc",
  // 使用CustomEvent来进行通讯
  domEvent: ".dom",
} as const;
