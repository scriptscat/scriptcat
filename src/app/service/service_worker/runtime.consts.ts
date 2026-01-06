export const DefinedFlags = {
  // Server: 回应 outbound (scripting -> content / page)
  inboundFlag: ".ib",
  // Client: 发送至 inbound (content / page -> scripting)
  outboundFlag: ".ob",
  // 脚本加载完成事件
  scriptLoadComplete: ".slc",
  // 环境加载完成事件
  envLoadComplete: ".elc",
  // 使用CustomEvent来进行通讯
  domEvent: ".dom",
} as const;
