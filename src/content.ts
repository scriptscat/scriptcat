import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { CustomEventMessage, createPageMessaging } from "@Packages/message/custom_event_message";
import { pageAddEventListener, pageDispatchCustomEvent, pageDispatchEvent } from "@Packages/message/common";
import { ScriptEnvTag } from "@Packages/message/common";
import { uuidv5 } from "./pkg/utils/uuid";
import { initEnvInfo, ScriptExecutor } from "./app/service/content/script_executor";
import type { ValueUpdateDataEncoded } from "./app/service/content/types";
import type { TClientPageLoadInfo } from "./app/repo/scripts";

/* global MessageFlag */

// ================================
// 常量与全局状态
// ================================

// 判断当前是否运行在 USER_SCRIPT 环境 (content环境)
const isContent = typeof chrome.runtime?.sendMessage === "function";
const scriptEnvTag = isContent ? ScriptEnvTag.content : ScriptEnvTag.inject;

// 用于通知页面：content executor 已准备好
const executorEnvReadyKey = uuidv5("scriptcat-executor-ready", MessageFlag);

// 页面通信通道（event token 会在握手后设置）
const scriptingMessaging = createPageMessaging(""); // injectFlagEvt
const pageMessaging = createPageMessaging(""); // `${injectFlagEvt}_${scriptEnvTag}`

// scripting <-> content 的双向消息桥
const msg = new CustomEventMessage(pageMessaging, false);

// 日志系统（仅在 scripting 环境打印）
const logger = new LoggerCore({
  writer: new MessageWriter(msg, "scripting/logger"),
  consoleLevel: "none",
  labels: { env: "content", href: window.location.href },
});

// 脚本执行器
const scriptExecutor = new ScriptExecutor(msg);

// 一次性绑定函数（绑定完成后会被置空）
let bindScriptingDeliveryOnce: (() => void) | null = null;

// ================================
// 工具函数：token 与握手
// ================================

// 确保 scripting messaging 已就绪
const requireScriptingToken = (): string => {
  if (!scriptingMessaging.et) {
    // scriptingMessaging 尚未准备好或已被销毁
    throw new Error("scriptingMessaging is not ready or destroyed");
  }
  return scriptingMessaging.et;
};

// 重置所有页面通信 token（用于反注册脚本）
const resetMessagingTokens = () => {
  scriptingMessaging.et = "";
  pageMessaging.et = "";
};

// 根据 injectFlagEvt 设置双方通信 token
const setMessagingTokens = (injectFlagEvt: string) => {
  scriptingMessaging.et = injectFlagEvt;
  pageMessaging.et = `${injectFlagEvt}_${scriptEnvTag}`;
};

// 通知 scripting 侧：content 已完成初始化
const acknowledgeScriptingReady = (injectFlagEvt: string) => {
  pageDispatchCustomEvent(injectFlagEvt, {
    [`emitterKeyFor${injectFlagEvt}`]: isContent ? 2 : 1,
  });
};

// ================================
// 消息分发处理
// ================================

// 处理 scripting -> content 的消息
const handleDeliveryMessage = (tag: string, value: any) => {
  switch (tag) {
    case "localStorage:scriptInjectMessageFlag": {
      // 反注册所有脚本时，中断页面通信
      resetMessagingTokens();
      return;
    }

    case "valueUpdateDelivery": {
      // storage / value 更新同步
      const sendData = value.sendData as ValueUpdateDataEncoded;
      scriptExecutor.valueUpdate(sendData);
      return;
    }

    case "scripting/runtime/emitEvent": {
      // scripting 主动触发事件
      scriptExecutor.emitEvent(value);
      return;
    }

    case "pageLoad": {
      // 页面加载完成，启动匹配的脚本
      const info = value as TClientPageLoadInfo;
      if (!info.ok) return;

      const { contentScriptList, envInfo } = info;
      logger.logger().debug("content start - pageload");
      scriptExecutor.startScripts(contentScriptList, envInfo);
      return;
    }

    default:
      // 未识别的消息类型直接忽略
      return;
  }
};

// ================================
// 页面通信绑定与握手
// ================================

// 监听 scripting 发来的 delivery 消息
const bindScriptingDeliveryChannel = () => {
  const token = requireScriptingToken();

  pageAddEventListener(`evt_${token}_deliveryMessage`, (ev) => {
    if (!(ev instanceof CustomEvent)) return;

    const { tag, value } = ev.detail ?? {};
    handleDeliveryMessage(tag, value);
  });
};

// 建立 scripting <-> content 的握手流程
const setupHandshake = () => {
  // 准备一次性绑定函数
  bindScriptingDeliveryOnce = () => {
    bindScriptingDeliveryOnce = null;
    bindScriptingDeliveryChannel();
  };

  // 等待 scripting 注入完成并发送 injectFlagEvt
  pageAddEventListener(executorEnvReadyKey, (ev) => {
    if (!(ev instanceof CustomEvent)) return;

    const injectFlagEvt = ev.detail?.injectFlagEvt;

    // 已初始化 / 参数非法 / 已绑定过 → 忽略
    if (scriptingMessaging.et || typeof injectFlagEvt !== "string" || !bindScriptingDeliveryOnce) {
      return;
    }

    // 接受此次握手
    ev.preventDefault();

    // 初始化通信 token
    setMessagingTokens(injectFlagEvt);
    msg.bindReceiver();

    logger.logger().debug("content start - init");

    // 建立消息监听
    bindScriptingDeliveryOnce();

    // 回传 ready 信号
    acknowledgeScriptingReady(injectFlagEvt);
  });
};

// ================================
// 启动流程
// ================================

// 检查 early-start 脚本
scriptExecutor.checkEarlyStartScript(scriptEnvTag, MessageFlag, initEnvInfo);

// 建立握手与通信绑定
setupHandshake();

// 主动触发 ready 事件，请求 scripting 建立连接
pageDispatchEvent(new CustomEvent(executorEnvReadyKey));
