import type { IMConnection, IMRequester, TMessageCommCode } from "./types";
import LoggerCore from "@App/app/logger/core";
import Logger from "@App/app/logger/logger";

export async function actionDataSend<T = any>(msg: IMRequester, action: string, data?: any): Promise<T | undefined> {
  const res = await msg.sendMessage<TMessageCommCode<T>>({ action, data });
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

export function actionDataConnect(msg: IMRequester, action: string, data?: any): Promise<IMConnection> {
  return msg.connect({ action, data });
}

export class Client {
  constructor(
    private msg: IMRequester,
    private prefix?: string
  ) {
    if (this.prefix && !this.prefix.endsWith("/")) {
      this.prefix += "/";
    } else {
      this.prefix = "";
    }
  }

  do<T = any>(action: string, data?: any): Promise<T | undefined> {
    return actionDataSend<T>(this.msg, `${this.prefix}${action}`, data);
  }

  async doThrow<T = any>(action: string, data?: any): Promise<T> {
    const ret = await actionDataSend<T>(this.msg, `${this.prefix}${action}`, data);
    if (!ret) {
      throw new Error(`doThrow: ${this.prefix}${action}`);
    }
    return ret;
  }
}
