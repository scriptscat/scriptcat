import type { Message, MessageConnect, OnConnectCallback, OnMessageCallback, TMessage } from "./types";
import { MessagePortMessage } from "./message_port_message";

export const SANDBOX_CHANNEL_BOOTSTRAP_MARKER = "scriptcat/sandbox-message-port/v1";

const nativeReflectApply = Reflect.apply;
const nativeFunctionBind = Function.prototype.bind;
const bindNative = <T extends (...args: any[]) => any>(fn: T, receiver: any): T =>
  nativeReflectApply(nativeFunctionBind, fn, [receiver]) as T;

type PendingListeners = {
  messages: OnMessageCallback[];
  connects: OnConnectCallback[];
};

/**
 * Parent-side transport for Offscreen/EventPage ↔ Sandbox.
 *
 * The Window "message" listener exists only until the sandbox transfers exactly one MessagePort.
 * After that first valid bootstrap the listener is removed permanently and all real payloads use
 * the private port. Source-window identity is checked before accepting the transferred capability.
 */
export class SandboxChannelHost implements Message {
  private readonly getTarget: () => Window;
  private readonly removeWindowListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  private readonly bootstrapHandler: EventListener;
  private readonly pending: PendingListeners = { messages: [], connects: [] };
  private delegate?: MessagePortMessage;
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private disposed = false;

  constructor(sourceWindow: Window, target: Window | (() => Window)) {
    this.getTarget = typeof target === "function" ? target : () => target;
    const addWindowListener = bindNative(sourceWindow.addEventListener, sourceWindow);
    this.removeWindowListener = bindNative(sourceWindow.removeEventListener, sourceWindow);
    this.readyPromise = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });

    this.bootstrapHandler = ((event: MessageEvent) => {
      if (this.disposed || this.delegate) return;

      let expectedSource: Window;
      try {
        expectedSource = this.getTarget();
      } catch {
        return;
      }
      if (event.source !== expectedSource) return;
      if (event.data !== SANDBOX_CHANNEL_BOOTSTRAP_MARKER) return;
      if (event.ports.length !== 1 || !event.ports[0]) return;

      const delegate = new MessagePortMessage(event.ports[0]);
      this.delegate = delegate;
      this.removeWindowListener("message", this.bootstrapHandler);

      for (let i = 0; i < this.pending.messages.length; i += 1) {
        delegate.onMessage(this.pending.messages[i]);
      }
      for (let i = 0; i < this.pending.connects.length; i += 1) {
        delegate.onConnect(this.pending.connects[i]);
      }
      this.pending.messages.length = 0;
      this.pending.connects.length = 0;
      this.resolveReady();
    }) as EventListener;

    addWindowListener("message", this.bootstrapHandler);
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  isReady(): boolean {
    return this.delegate !== undefined;
  }

  async connect(data: TMessage): Promise<MessageConnect> {
    await this.readyPromise;
    if (this.disposed || !this.delegate) throw new Error("Sandbox channel is unavailable.");
    return this.delegate.connect(data);
  }

  async sendMessage<T = any>(data: TMessage): Promise<T> {
    await this.readyPromise;
    if (this.disposed || !this.delegate) throw new Error("Sandbox channel is unavailable.");
    return this.delegate.sendMessage<T>(data);
  }

  onConnect(callback: OnConnectCallback): void {
    if (this.disposed) throw new Error("SandboxChannelHost is disposed.");
    if (this.delegate) {
      this.delegate.onConnect(callback);
      return;
    }
    this.pending.connects.push(callback);
  }

  onMessage(callback: OnMessageCallback): void {
    if (this.disposed) throw new Error("SandboxChannelHost is disposed.");
    if (this.delegate) {
      this.delegate.onMessage(callback);
      return;
    }
    this.pending.messages.push(callback);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.delegate) this.removeWindowListener("message", this.bootstrapHandler);
    this.pending.messages.length = 0;
    this.pending.connects.length = 0;
    this.delegate?.dispose();
  }
}

export type SandboxChannelClient = {
  message: MessagePortMessage;
  transferToParent(): void;
};

/**
 * Sandbox-side channel factory.
 *
 * The private endpoint is created and wired before transfer. Call transferToParent() only after
 * the sandbox Server/Runtime listeners are installed; receiving the transferred port therefore
 * doubles as the parent's verified "sandbox ready" signal.
 */
export const createSandboxChannelClient = (
  parentWindow: Window = parent,
  channel: MessageChannel = new MessageChannel()
): SandboxChannelClient => {
  const message = new MessagePortMessage(channel.port1);
  const parentPostMessage = bindNative(parentWindow.postMessage, parentWindow) as (
    message: unknown,
    targetOrigin: string,
    transfer?: Transferable[]
  ) => void;
  let transferred = false;

  return {
    message,
    transferToParent() {
      if (transferred) throw new Error("Sandbox channel has already been transferred.");
      transferred = true;
      parentPostMessage(SANDBOX_CHANNEL_BOOTSTRAP_MARKER, "*", [channel.port2]);
    },
  };
};
