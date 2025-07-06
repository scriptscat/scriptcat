import LoggerCore from "./app/logger/core";
import MessageWriter from "./app/logger/message_writer";
import MessageContent from "./app/message/content";
import MessageInternal from "./app/message/internal";
import ContentRuntime from "./runtime/content/content";
// @ts-ignore
import injectJs from "../dist/inject.js";
import { randomString } from "./pkg/utils/utils";

const internalMessage = new MessageInternal("content");

const logger = new LoggerCore({
  debug: process.env.NODE_ENV === "development",
  writer: new MessageWriter(internalMessage),
  labels: { env: "content", href: window.location.href },
});

const scriptFlag = randomString(8);

const fixCoding = (text) => {
    const toXChar = char => `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`;
    return text.replace(/['"][\x00-\x1F]+['"]/g, match => 
        match.replace(/[\x00-\x1F]/g, toXChar)
    ).replace(/\b[a-z]{4,8}:\s*['"]\[(.)-(.)\]['"]/g, (match, start, end) => 
        match.replace(`${start}-${end}`, `${toXChar(start)}-${toXChar(end)}`)
    );
};

const injectJs_ = fixCoding(injectJs);

// 注入运行框架
const temp = document.createElementNS("http://www.w3.org/1999/xhtml", "script");
temp.setAttribute("type", "text/javascript");
temp.setAttribute("charset", "UTF-8");
temp.textContent = `(function (ScriptFlag) {\n${injectJs_}\n})('${scriptFlag}')`;
temp.className = "injected-js";
document.documentElement.appendChild(temp);
temp.remove();

internalMessage.syncSend("pageLoad", null).then((resp) => {
  logger.logger().debug("content start");
  // 通过flag与inject建立通讯
  const contentMessage = new MessageContent(scriptFlag, true);
  new ContentRuntime(contentMessage, internalMessage).start(resp);
});
