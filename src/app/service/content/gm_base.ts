import { type ScriptRunResource } from "@App/app/repo/scripts";
import type { ValueUpdateData } from "./types";
import type { Message } from "@Packages/message/types";
import type { MessageRequest } from "../service_worker/types";
import { connect, sendMessage } from "@Packages/message/client";
import { getStorageName } from "@App/pkg/utils/utils";
import type EventEmitter from "eventemitter3";

// 通用类，用于 GM 通信机制

export class GM_Base {

  runFlag!: string;

  constructor(
    public prefix: string,
    public message: Message,
    public scriptRes: ScriptRunResource,
    public valueChangeListener: Map<number, { name: string; listener: GMTypes.ValueChangeListener }>,
    public EE: EventEmitter,
  ) { }

  // 单次回调使用
  public sendMessage(api: string, params: any[]) {
    return sendMessage(this.message, this.prefix + "/runtime/gmApi", {
      uuid: this.scriptRes.uuid,
      api,
      params,
      runFlag: this.runFlag,
    } as MessageRequest);
  }

  // 长连接使用,connect只用于接受消息,不发送消息
  public connect(api: string, params: any[]) {
    return connect(this.message, this.prefix + "/runtime/gmApi", {
      uuid: this.scriptRes.uuid,
      api,
      params,
      runFlag: this.runFlag,
    } as MessageRequest);
  }


  public valueUpdate(data: ValueUpdateData) {
    if (data.uuid === this.scriptRes.uuid || data.storageName === getStorageName(this.scriptRes)) {
      // 触发,并更新值
      if (data.value === undefined) {
        if (this.scriptRes.value[data.key] !== undefined) {
          delete this.scriptRes.value[data.key];
        }
      } else {
        this.scriptRes.value[data.key] = data.value;
      }
      this.valueChangeListener.forEach((item) => {
        if (item.name === data.key) {
          item.listener(data.key, data.oldValue, data.value, data.sender.runFlag !== this.runFlag, data.sender.tabId);
        }
      });
    }
  }

  emitEvent(event: string, eventId: string, data: any) {
    this.EE.emit(event + ":" + eventId, data);
  }

}