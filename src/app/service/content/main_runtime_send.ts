import type { MessageConnect, MessageSend, TMessage } from "@Packages/message/types";

/** Outbound-only MAIN transport selector. Inbound packets stay owned by the page/native servers. */
export class MainRuntimeSend implements MessageSend {
  private mode: "unselected" | "native" | "fallback" = "unselected";

  constructor(
    private readonly nativeMessage: MessageSend,
    private readonly pageMessage: MessageSend
  ) {}

  selectNative(): void {
    this.mode = "native";
  }

  selectFallback(): void {
    this.mode = "fallback";
  }

  private select(message: TMessage): { sender: MessageSend; message: TMessage } {
    if (this.mode === "unselected") throw new Error("MAIN transport is not selected");
    if (this.mode === "native") return { sender: this.nativeMessage, message };
    if (message.action === "serviceWorker/runtime/gmApi") {
      return {
        sender: this.pageMessage,
        message: { ...message, action: "scripting/runtime/gmApi" },
      };
    }
    throw new Error(`MAIN fallback does not support ${message.action}`);
  }

  sendMessage<T = any>(message: TMessage): Promise<T> {
    try {
      const selected = this.select(message);
      return selected.sender.sendMessage<T>(selected.message);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  connect(message: TMessage): Promise<MessageConnect> {
    try {
      const selected = this.select(message);
      return selected.sender.connect(selected.message);
    } catch (error) {
      return Promise.reject(error);
    }
  }
}
