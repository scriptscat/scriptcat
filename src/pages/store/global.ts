import { MessageQueue } from "@Packages/message/message_queue";
import { SystemConfig } from "@App/pkg/config/config";
import { ExtensionMessage } from "@Packages/message/extension_message";
import { initLocales } from "@App/locales/locales";

const messageQueue = new MessageQueue();
export const systemConfig = new SystemConfig(messageQueue);
export const message = new ExtensionMessage();

export const subscribeMessage = <T extends object>(topic: string, handler: (msg: T) => void) => {
  return messageQueue.subscribe<T & { myMessage?: T }>(topic, (data) => {
    const payload = data?.myMessage || data;
    if (typeof payload === "object") {
      handler(payload as T);
    }
  });
};

initLocales(systemConfig);
