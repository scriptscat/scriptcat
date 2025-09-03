export type TMessageQueue<T = any> = {
  msgQueue: string;
  data: {
    action: string;
    message: NonNullable<T>;
  };
  action?: never;
  code?: never;
};

export type TMessageCommAction<T = any> = {
  action: string;
  data?: NonNullable<T>;
  msgQueue?: never;
  code?: never;
};

export type TMessageCommCode<T = any> = {
  code: number;
  msgQueue?: never;
  action?: never;
  data?: NonNullable<T>;
  message?: NonNullable<string>;
};

export type TMessage<T = any> = TMessageQueue<T> | TMessageCommAction<T> | TMessageCommCode<T>;

export type MessageSender = chrome.runtime.MessageSender;

export interface Message extends MessageSend {
  onConnect(callback: (data: TMessage, con: MessageConnect) => void): void;
  onMessage(
    callback: (data: TMessage, sendResponse: (data: any) => void, sender?: MessageSender) => boolean | void
  ): void;
}

export interface MessageSend {
  connect(data: TMessage): Promise<MessageConnect>;
  sendMessage<T = any>(data: TMessage): Promise<T>;
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
