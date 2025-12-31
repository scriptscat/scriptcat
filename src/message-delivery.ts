import { pageDispatchCustomEvent } from "@Packages/message/common";

export class MessageDelivery {
  private messageStack: any[] | null = [];
  private messageKey: string = "";

  public dispatch(detail: any) {
    const messageStack = this.messageStack;
    const messageKey = this.messageKey;
    if (messageStack === null) {
      if (!messageKey) throw new Error("messageKey is not ready or destroyed");
      pageDispatchCustomEvent(messageKey, detail);
    } else {
      // 在取得 messageKey 前，先堆叠一下，避免漏掉
      messageStack.push(detail);
    }
  }

  public setup(et: string) {
    this.messageKey = `${et}`;
    const messageStack = this.messageStack;
    if (messageStack) {
      const messages = messageStack.slice();
      messageStack.length = 0;
      this.messageStack = null;
      if (messages.length > 0) {
        for (const message of messages) {
          this.dispatch(message);
        }
      }
    }
  }
}
