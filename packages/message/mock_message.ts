import type { Message, MessageConnect, RuntimeMessageSender, TMessage } from "./types";
import EventEmitter from "eventemitter3";
import { sleep } from "@App/pkg/utils/utils";

export class MockMessageConnect implements MessageConnect {
  EE: EventEmitter<string, any> | null;
  constructor(EE: EventEmitter<string, any>) {
    this.EE = EE;
  }

  onMessage(callback: (data: TMessage) => void): void {
    if (!this.EE) {
      console.error("onMessage Invalid MockConnection");
      // 無法監聽的話不应该屏蔽错误
      throw new Error("onMessage Invalid MockConnection");
    }
    this.EE.on("message", (data: any) => {
      callback(data);
    });
  }

  sendMessage(data: TMessage): void {
    if (!this.EE) {
      console.warn("Attempted to sendMessage on a disconnected MockConnection.");
      // 無法 sendMessage 不应该屏蔽错误
      throw new Error("Attempted to sendMessage on a disconnected MockConnection.");
    }
    this.EE.emit("message", data);
  }

  disconnect(ignoreAlreadyDisconnected?: boolean): void {
    if (!this.EE) {
      if (ignoreAlreadyDisconnected) return;
      console.warn("Attempted to disconnect on a disconnected MockConnection.");
      // 重复 disconnect() 不应该屏蔽错误
      throw new Error("Attempted to disconnect on a disconnected MockConnection.");
    }
    const EE = this.EE;
    this.EE = null;
    EE?.emit("disconnect", true); // MockMessageConnect 未有模拟由另一端触发 disconnect() 的情况
  }

  onDisconnect(callback: (isSelfDisconnected: boolean) => void) {
    if (!this.EE) {
      console.error("onDisconnect Invalid MockConnection.");
      // 無法監聽的話不应该屏蔽错误
      throw new Error("onDisconnect Invalid MockConnection.");
    }
    this.EE.once("disconnect", callback);
  }
}

export class MockMessage implements Message {
  constructor(protected EE: EventEmitter<string, any>) {}

  connect(data: TMessage): Promise<MessageConnect> {
    return new Promise((resolve) => {
      const EE = new EventEmitter<string, any>();
      const con = new MockMessageConnect(EE);
      resolve(con);
      sleep(1).then(() => {
        this.EE.emit("connect", data, con);
      });
    });
  }

  sendMessage<T = any>(data: TMessage): Promise<T> {
    return new Promise((resolve) => {
      this.EE.emit("message", data, (resp: T) => {
        resolve(resp);
      });
    });
  }

  onConnect(callback: (data: TMessage, con: MessageConnect) => void): void {
    this.EE.on("connect", (data: any, con: MessageConnect) => {
      callback(data, con);
    });
  }

  onMessage(
    callback: (data: TMessage, sendResponse: (data: any) => void, _sender: RuntimeMessageSender) => void
  ): void {
    this.EE.on("message", (data: TMessage, sendResponse: (data: any) => void, sender: RuntimeMessageSender) => {
      callback(data, sendResponse, sender);
    });
  }
}
