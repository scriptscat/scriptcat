// 消息传递
export type TMessageQueue<T = any> = {
  msgQueue: string;
  data: {
    action: string;
    message: NonNullable<T>;
  };
  action?: never;
  code?: never;
};

// 交互讯息
export type TMessageCommAction<T = any> = {
  action: string;
  data?: NonNullable<T>;
  msgQueue?: never;
  code?: never;
};

// 回应讯息
export type TMessageCommCode<T = any> = {
  code: number;
  msgQueue?: never;
  action?: never;
  data?: NonNullable<T>;
  message?: NonNullable<string>;
};

export type TMessage<T = any> = TMessageQueue<T> | TMessageCommAction<T> | TMessageCommCode<T>;

export type MessageSender = chrome.runtime.MessageSender;

export interface IMRequester {
  connect(data: TMessage): Promise<IMConnection>;
  sendMessage<T>(data: TMessage): Promise<T>;
}

export interface IMRequesterReceiver extends IMRequester {
  onConnect(callback: (data: TMessage, con: IMConnection) => void): void;
  onMessage(
    callback: (
      data: TMessage,
      sendResponse: (msgResp: TMessageCommCode) => void,
      sender?: MessageSender
    ) => boolean | void
  ): void;
}

export interface IMConnection {
  onMessage(callback: (data: TMessage) => void): void;
  sendMessage(msg: TMessage): void;
  disconnect(): void;
  onDisconnect(callback: () => void): void;
}

export type ExtMessageSender = {
  tabId: number;
  frameId?: number;
  documentId?: string;
  windowId?: number;
};
