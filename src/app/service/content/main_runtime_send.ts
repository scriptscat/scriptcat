import type { Message, MessageConnect, MessageSend, TMessage } from "@Packages/message/types";

/** Outbound-only MAIN transport selector. Inbound packets stay owned by the page/native servers. */
export class MainRuntimeSend implements Message {
  private mode: "native" | "fallback" = "native";

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
    if (this.mode === "native") return { sender: this.nativeMessage, message };
    if (message.action === "serviceWorker/runtime/gmApi") {
      return {
        sender: this.pageMessage,
        message: { ...message, action: "scripting/runtime/gmApi" },
      };
    }
    return { sender: this.pageMessage, message };
  }

  sendMessage<T = any>(message: TMessage): Promise<T> {
    const selected = this.select(message);
    return selected.sender.sendMessage<T>(selected.message);
  }

  connect(message: TMessage): Promise<MessageConnect> {
    const selected = this.select(message);
    return selected.sender.connect(selected.message);
  }

  onConnect(): void {
    // The adapter deliberately does not own inbound traffic.
  }

  onMessage(): void {
    // The adapter deliberately does not own inbound traffic.
  }
}
