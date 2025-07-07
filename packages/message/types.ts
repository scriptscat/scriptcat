export type MessageSender = chrome.runtime.MessageSender;

export interface Message extends MessageSend {
  onConnect(callback: (data: any, con: MessageConnect) => void): void;
  onMessage(callback: (data: any, sendResponse: (data: any) => void, sender?: MessageSender) => void): void;
}

export interface MessageSend {
  connect(data: any): Promise<MessageConnect>;
  sendMessage(data: any): Promise<any>;
}

export interface MessageConnect {
  onMessage(callback: (data: any) => void): void;
  sendMessage(data: any): void;
  disconnect(): void;
  onDisconnect(callback: () => void): void;
}

export type ExtMessageSender = {
  tabId: number;
  frameId?: number;
  documentId?: string;
};