import type { MessageSend, MessageConnect, TMessageCommAction, TMessageCommCode } from "./types";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";

export async function sendMessage<T = any>(msgSender: MessageSend, action: string, data?: any): Promise<T | undefined> {
  const res = await msgSender.sendMessage<TMessageCommCode<T> | TMessageCommAction<T>>({ action, data });
  const logger = LoggerCore.getInstance().logger().with({ action, data, response: res });
  logger.trace("sendMessage");
  if (res?.code) {
    console.error(res);
    throw res.message;
  } else {
    try {
      return res.data;
    } catch (e) {
      logger.trace("Invalid response data", Logger.E(e));
      return undefined;
    }
  }
}

export function connect(msgSender: MessageSend, action: string, data?: any): Promise<MessageConnect> {
  return msgSender.connect({ action, data });
}

export class Client {
  constructor(
    protected msgSender: MessageSend,
    protected prefix?: string
  ) {
    if (this.prefix && !this.prefix.endsWith("/")) {
      this.prefix += "/";
    } else {
      this.prefix = "";
    }
  }

  do<T = any>(action: string, params?: any): Promise<T | undefined> {
    return sendMessage<T>(this.msgSender, `${this.prefix}${action}`, params);
  }

  async doThrow<T = any>(action: string, params?: any): Promise<T> {
    const ret = await sendMessage<T>(this.msgSender, `${this.prefix}${action}`, params);
    if (!ret) {
      throw new Error(`doThrow: ${this.prefix}${action}`);
    }
    return ret;
  }
}
