import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import MessageContent from "./app/message/content";
import MessageInternal from "./app/message/internal";
import ContentRuntime from "./runtime/content/content";
// @ts-ignore
import injectJs from "../dist/inject.js";
import { randomString, fixCoding } from "./pkg/utils/utils";

const internalMessage = new MessageInternal("content");

const logger = new LoggerCore({
  debug: process.env.NODE_ENV === "development",
  writer: new MessageWriter(internalMessage),
  labels: { env: "content", href: window.location.href },
});

const scriptFlag = randomString(8);

const injectJs1 = fixCoding(injectJs);
const randomId = (Math.random() + 10).toString(36);

// 注入运行框架
let temp: HTMLScriptElement | null = document.createElementNS("http://www.w3.org/1999/xhtml", "script") as HTMLScriptElement;
temp.setAttribute("type", "text/javascript");
temp.setAttribute("charset", "UTF-8");
temp.textContent = `(function (ScriptFlag) {\n${injectJs1}\n})('${scriptFlag}');\ndispatchEvent(new CustomEvent('${randomId}'));`;
temp.className = "injected-js";
// eslint-disable-next-line no-restricted-globals
addEventListener(randomId, () => { temp && temp.remove(); temp = null; }, { once: true });
document.documentElement.appendChild(temp);

internalMessage.syncSend("pageLoad", null).then((resp) => {
  logger.logger().debug("content start");
  // 通过flag与inject建立通讯
  const contentMessage = new MessageContent(scriptFlag, true);
  new ContentRuntime(contentMessage, internalMessage).start(resp);
});
