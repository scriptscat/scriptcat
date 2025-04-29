import LoggerCore from "@App/app/logger/core";
import { MessageConnect, MessageSend } from "./server";
import Logger from "@App/app/logger/logger";

export async function sendMessage(msg: MessageSend, action: string, data?: any): Promise<any> {
  const res = await msg.sendMessage({ action, data });
  const logger = LoggerCore.getInstance().logger().with({ action, data, response: res });
  logger.trace("sendMessage");
  if (res && res.code) {
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

export function connect(msg: MessageSend, action: string, data?: any): Promise<MessageConnect> {
  return msg.connect({ action, data });
}

export class Client {
  constructor(
    private msg: MessageSend,
    private prefix?: string
  ) {
    if (this.prefix && !this.prefix.endsWith("/")) {
      this.prefix += "/";
    } else {
      this.prefix = "";
    }
  }

  do(action: string, params?: any): Promise<any> {
    return sendMessage(this.msg, this.prefix + action, params);
  }
}
