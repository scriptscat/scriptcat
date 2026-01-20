import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import { CustomEventMessage, createPageMessaging } from "@Packages/message/custom_event_message";
import { pageAddEventListener, pageDispatchCustomEvent } from "@Packages/message/common";
import { ScriptEnvTag, ScriptEnvType } from "@Packages/message/common";
import { uuidv5 } from "./pkg/utils/uuid";
import { randomMessageFlag, makeBlobURL } from "@App/pkg/utils/utils";
import { ExtensionMessage } from "@Packages/message/extension_message";
import type { Message, MessageSend } from "@Packages/message/types";
import { Server, forwardMessage } from "@Packages/message/server";
import { RuntimeClient } from "@App/app/service/service_worker/client";
import type { Logger } from "@App/app/repo/logger";
import { MessageDelivery } from "./message-delivery";

//@ts-ignore
const MessageFlag = uuidv5(`${performance.timeOrigin}`, process.env.SC_RANDOM_KEY);

// ================================
// 常量与全局状态
// ================================

// 记录脚本 uuid 来自 inject(1) / content(2)
const uuids = new Map<string, ScriptEnvType>();

// 与 service_worker 通信的 sender（scripting -> service_worker）
const senderToExt: Message = new ExtensionMessage(false);

// scripting <-> inject/content 的 page messaging（token 在握手后设置）
const scriptExecutorMsgIT = createPageMessaging("");
const scriptExecutorMsgCT = createPageMessaging("");

// scripting <-> inject/content 的双向消息桥
const scriptExecutorMsgTxIT = new CustomEventMessage(scriptExecutorMsgIT, true); // 双向：scripting <-> inject
const scriptExecutorMsgTxCT = new CustomEventMessage(scriptExecutorMsgCT, true); // 双向：scripting <-> content

// 初始化日志组件（写入 service_worker/logger）
const loggerCore = new LoggerCore({
  writer: new MessageWriter(senderToExt, "serviceWorker/logger"),
  labels: { env: "scripting" },
});

// scripting 对页面投递消息的通道（token 在握手后设置）
const scriptingMessaging = createPageMessaging(""); // 对 inject / content 的 client 发出消息

// 将消息从 scripting 投递到 inject/content 的工具（基于自定义事件）
const messageDeliveryToPage = new MessageDelivery();

// service_worker 客户端
const client = new RuntimeClient(senderToExt);

loggerCore.logger().debug("scripting start");

// ================================
// 工具函数：基础检查与小封装
// ================================

// 确保 scripting messaging 已就绪
const requireScriptingToken = (): string => {
  if (!scriptingMessaging.et) {
    // scriptingMessaging 尚未准备好或已被销毁
    throw new Error("scriptingMessaging is not ready or destroyed");
  }
  return scriptingMessaging.et;
};

const setupDeliveryChannel = () => {
  const token = requireScriptingToken();
  messageDeliveryToPage.setup(`evt_${token}_deliveryMessage`);
};

// ================================
// Server 构建与 service_worker 转发
// ================================

type GmApiPayload = { api: string; params: any; uuid: string };

const handleRuntimeGmApi = (
  senderToInject: CustomEventMessage,
  senderToContent: CustomEventMessage,
  data: GmApiPayload
) => {
  // 拦截关注的 API，未命中则返回 false 交由默认转发处理
  switch (data.api) {
    case "CAT_createBlobUrl": {
      const file = data.params[0] as File;
      const url = makeBlobURL({ blob: file, persistence: false }) as string;
      return url;
    }
    case "CAT_fetchBlob": {
      return fetch(data.params[0]).then((res) => res.blob());
    }
    case "CAT_fetchDocument": {
      const [url, isContent] = data.params;
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.responseType = "document";
        xhr.open("GET", url);
        xhr.onload = () => {
          // 根据来源选择不同的消息桥（content / inject）
          const msg = isContent ? senderToContent : senderToInject;
          const nodeId = msg.sendRelatedTarget(xhr.response);
          resolve(nodeId);
        };
        xhr.send();
      });
    }
    case "GM_addElement": {
      const [parentNodeId, tagName, tmpAttr, isContent] = data.params;

      // 根据来源选择不同的消息桥（content / inject）
      const msg = isContent ? senderToContent : senderToInject;

      // 取回 parentNode（如果存在）
      let parentNode: Node | undefined;
      if (parentNodeId) {
        parentNode = msg.getAndDelRelatedTarget(parentNodeId) as Node | undefined;
      }

      // 创建元素并设置属性
      const el = <Element>document.createElement(tagName);
      const attr = tmpAttr ? { ...tmpAttr } : {};
      let textContent = "";
      if (attr.textContent) {
        textContent = attr.textContent;
        delete attr.textContent;
      }
      for (const key of Object.keys(attr)) {
        el.setAttribute(key, attr[key]);
      }
      if (textContent) el.textContent = textContent;

      // 优先挂到 parentNode，否则挂到 head/body/任意节点
      const node = parentNode || document.head || document.body || document.querySelector("*");
      node.appendChild(el);

      // 返回节点引用 id，供另一侧再取回
      const nodeId = msg.sendRelatedTarget(el);
      return nodeId;
    }
    case "GM_log":
      // 拦截 GM_log：直接打印到控制台（某些页面可能劫持 console.log）
      switch (data.params.length) {
        case 1:
          console.log(data.params[0]);
          break;
        case 2:
          console.log("[" + data.params[1] + "]", data.params[0]);
          break;
        case 3:
          console.log("[" + data.params[1] + "]", data.params[0], data.params[2]);
          break;
      }
      break;
  }
  return false;
};

const prepareServer = (
  server: Server,
  senderToExt: MessageSend,
  senderToInject: CustomEventMessage,
  senderToContent: CustomEventMessage
) => {
  // service_worker 下发日志：统一打印
  server.on("logger", (data: Logger) => {
    LoggerCore.logger().log(data.level, data.message, data.label);
  });

  // 将 inject/content 的请求转发到 service_worker
  forwardMessage("serviceWorker", "script/isInstalled", server, senderToExt);

  // runtime/gmApi：对部分 API 做拦截处理
  forwardMessage("serviceWorker", "runtime/gmApi", server, senderToExt, (data: GmApiPayload) => {
    return handleRuntimeGmApi(senderToInject, senderToContent, data);
  });
};

// ================================
// 握手：MessageFlag 与 injectFlagEvt 协商
// ================================

/**
 * 握手目标：
 * - scripting 生成 injectFlagEvt（随机）
 * - content/inject 通过 executorEnvReadyKey 收到 injectFlagEvt，并回发 emitterKey
 * - 当 scripting 收到 inject+content 都 ready 后，才建立 server + delivery 通道
 */
const onMessageFlagReceived = (MessageFlag: string) => {
  const executorEnvReadyKey = uuidv5("scriptcat-executor-ready", MessageFlag);

  // 由 scripting 随机生成，用于 scripting <-> inject/content 的消息通道 token
  const injectFlagEvt = randomMessageFlag();

  // readyFlag 位运算：inject=1，content=2，凑齐 3 表示都 ready. ready 后设为 4 避免再触发
  let readyFlag = 0;

  const finalizeWhenReady = () => {
    if (readyFlag === 3) {
      readyFlag = 4;

      // 统一设置 token
      scriptingMessaging.et = injectFlagEvt;
      scriptExecutorMsgIT.et = `${injectFlagEvt}_${ScriptEnvTag.inject}`;
      scriptExecutorMsgCT.et = `${injectFlagEvt}_${ScriptEnvTag.content}`;

      // 绑定 receiver（允许 inject/content 发消息给 scripting）
      scriptExecutorMsgTxIT.bindReceiver();
      scriptExecutorMsgTxCT.bindReceiver();

      // 建立 server：inject/content -> scripting 通道
      const server = new Server("scripting", [scriptExecutorMsgTxIT, scriptExecutorMsgTxCT]);
      prepareServer(server, senderToExt, scriptExecutorMsgTxIT, scriptExecutorMsgTxCT);

      // 建立向页面投递消息的 delivery 通道
      setupDeliveryChannel();
    }
  };

  // 接收 inject/content 的 ready 回执
  pageAddEventListener(`${injectFlagEvt}`, (ev) => {
    if (!(ev instanceof CustomEvent)) return;

    const key = `emitterKeyFor${injectFlagEvt}`;
    let value = ev.detail?.[key];
    if (!value) return;

    if (value !== ScriptEnvType.content) value = ScriptEnvType.inject; // 使 value 必定为 1 或 2
    readyFlag |= value;
    finalizeWhenReady();
  });

  // 向 inject/content 广播 injectFlagEvt（让它们知道后续用哪个 token 通信）
  const submitTarget = () => {
    return pageDispatchCustomEvent(executorEnvReadyKey, { injectFlagEvt });
  };

  // 处理“scripting 早于 content/inject 执行”的场景：
  // content/inject 会先发一个 executorEnvReadyKey（detail 为空）来探测 scripting 是否在
  pageAddEventListener(executorEnvReadyKey, (ev) => {
    if (ev instanceof CustomEvent && !ev.detail) {
      submitTarget();
    }
  });

  // 处理“scripting 晚于 content/inject 执行”的场景：
  // scripting 启动后主动广播一次 executorEnvReadyKey，content/inject 立刻能收到 injectFlagEvt
  submitTarget();
};

// ================================
// 来自 service_worker 的投递：storage 广播（类似 UDP）
// ================================

// 接收 service_worker 的 chrome.storage.local 值改变通知 （一对多广播）
// 类似 UDP 原理，service_worker 不会有任何「等待处理」
// 由于 changes 会包括新旧值 (Chrome: JSON serialization, Firefox: Structured Clone)
// 因此需要注意资讯量不要过大导致 onChanged 的触发过慢
chrome.storage.local.onChanged.addListener((changes) => {
  if (changes["localStorage:scriptInjectMessageFlag"]?.newValue) {
    messageDeliveryToPage.dispatch({
      tag: "localStorage:scriptInjectMessageFlag",
      value: changes["localStorage:scriptInjectMessageFlag"]?.newValue,
    });
  }
  if (changes["valueUpdateDelivery"]?.newValue) {
    messageDeliveryToPage.dispatch({
      tag: "valueUpdateDelivery",
      value: changes["valueUpdateDelivery"]?.newValue,
    });
  }
});

// ================================
// 来自 service_worker 的投递：runtime 一对一消息（类似 TCP）
// ================================

// 接收 service_worker 的 chrome.tabs.sendMessage （一对一消息）
// 类似 TCP 原理，service_worker 有「等待处理」
// 由于 message 会包括值 (Chrome: JSON serialization, Firefox: Structured Clone)
// 因此需要注意资讯量不要过大导致 等待处理 时间过长
chrome.runtime.onMessage.addListener((message, _sender) => {
  if (!message) return;
  const { action, data } = message;
  messageDeliveryToPage.dispatch({
    tag: action,
    value: data,
  });
});

// ================================
// 启动流程
// ================================

// 1) scripting 直接读取 MessageFlag，并开始握手
onMessageFlagReceived(MessageFlag);

// 2) 向 service_worker 请求脚本列表及环境信息，并下发给 inject/content
// 向service_worker请求脚本列表及环境信息
// - 以 ExtensionMessage 形式 从 scripting 发送到 service_worker 再以 Promise 形式取回 service_worker 结果
client.pageLoad().then((o) => {
  if (!o.ok) return;

  // 记录 uuid 来源：inject=1，content=2
  for (const entry of o.injectScriptList) {
    uuids.set(entry.uuid, ScriptEnvType.inject);
  }
  for (const entry of o.contentScriptList) {
    uuids.set(entry.uuid, ScriptEnvType.content);
  }
  // 一次性广播给 inject 和 content
  messageDeliveryToPage.dispatch({
    tag: "pageLoad",
    value: o,
  });
});
