import type { IMRequesterReceiver, IMConnection, IMRequester, TMessage } from "./types";
import EventEmitter from "eventemitter3";
import { sleep } from "@App/pkg/utils/utils";

export class MockMessageConnection implements IMConnection {
  constructor(protected EE: EventEmitter<string, any>) {}

  onMessage(callback: (data: TMessage) => void): void {
    this.EE.on("message", (data: any) => {
      callback(data);
    });
  }

  sendMessage(data: TMessage): void {
    this.EE.emit("message", data);
  }

  disconnect(): void {
    this.EE.emit("disconnect");
  }

  onDisconnect(callback: () => void): void {
    this.EE.on("disconnect", callback);
  }
}

class MockMessageRequester implements IMRequester {
  constructor(protected EE: EventEmitter<string, any>) {}

  connect(data: TMessage): Promise<IMConnection> {
    return new Promise((resolve) => {
      const EE = new EventEmitter<string, any>();
      const con = new MockMessageConnection(EE);
      resolve(con);
      sleep(1).then(() => {
        this.EE.emit("connect", data, con);
      });
    });
  }

  sendMessage(data: TMessage): Promise<any> {
    return new Promise((resolve) => {
      this.EE.emit("message", data, (resp: any) => {
        resolve(resp);
      });
    });
  }
}

export class MockMessenger extends MockMessageRequester implements IMRequesterReceiver {
  onConnect(callback: (data: TMessage, con: IMConnection) => void): void {
    this.EE.on("connect", (data: any, con: IMConnection) => {
      callback(data, con);
    });
  }

  onMessage(callback: (data: TMessage, sendResponse: (data: any) => void) => void): void {
    this.EE.on("message", (data: any, sendResponse: (data: any) => void) => {
      callback(data, sendResponse);
    });
  }
}
