import EventEmitter from "eventemitter3";
import { Message, MessageConnect, MessageSend } from "./server";
import { sleep } from "@App/pkg/utils/utils";

export class MockMessageConnect implements MessageConnect {
  constructor(protected EE: EventEmitter) {}

  onMessage(callback: (data: any) => void): void {
    this.EE.on("message", (data: any) => {
      callback(data);
    });
  }

  sendMessage(data: any): void {
    this.EE.emit("message", data);
  }

  disconnect(): void {
    this.EE.emit("disconnect");
  }

  onDisconnect(callback: () => void): void {
    this.EE.on("disconnect", callback);
  }
}

export class MockMessageSend implements MessageSend {
  constructor(protected EE: EventEmitter) {}

  connect(data: any): Promise<MessageConnect> {
    return new Promise((resolve) => {
      const EE = new EventEmitter();
      const con = new MockMessageConnect(EE);
      resolve(con);
      sleep(1).then(() => {
        this.EE.emit("connect", data, con);
      });
    });
  }

  sendMessage(data: any): Promise<any> {
    return new Promise((resolve) => {
      this.EE.emit("message", data, (resp: any) => {
        resolve(resp);
      });
    });
  }
}

export class MockMessage extends MockMessageSend implements Message {
  onConnect(callback: (data: any, con: MessageConnect) => void): void {
    this.EE.on("connect", (data: any, con: MessageConnect) => {
      callback(data, con);
    });
  }

  onMessage(callback: (data: any, sendResponse: (data: any) => void) => void): void {
    this.EE.on("message", (data: any, sendResponse: (data: any) => void) => {
      callback(data, sendResponse);
    });
  }
}
