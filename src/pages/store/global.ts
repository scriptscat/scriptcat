import { MessageQueue } from "@Packages/message/message_queue";
import { SystemConfig } from "@App/pkg/config/config";
import { ExtensionMessage } from "@Packages/message/extension_message";
import { initLocales } from "@App/locales/locales";
import { SystemClient } from "@App/app/service/service_worker/client";

export const messageQueue = new MessageQueue();
export const systemConfig = new SystemConfig(messageQueue);
export const globalCache = new Map<string, any>();
export const message = new ExtensionMessage();
export const systemClient = new SystemClient(message);

initLocales(systemConfig);
