import { type TMessage } from "./extension_message";

export type MessageSender = chrome.runtime.MessageSender;

export interface Message extends MessageSend {
  onConnect(callback: (data: TMessage, con: MessageConnect) => void): void;
  onMessage(
    callback: (data: TMessage, sendResponse: (data: any) => void, sender?: MessageSender) => boolean | void
  ): void;
}

export interface MessageSend {
  connect(data: TMessage): Promise<MessageConnect>;
  sendMessage(data: TMessage): Promise<any>;
}

export interface MessageConnect {
  onMessage(callback: (data: TMessage) => void): void;
  sendMessage(data: TMessage): void;
  disconnect(): void;
  onDisconnect(callback: () => void): void;
}

export type ExtMessageSender = {
  tabId: number;
  frameId?: number;
  documentId?: string;
  windowId?: number;
};
