import * as net from "node:net";
import { computeMac } from "../auth/challenge.js";
import type { BridgeAction, McpScope } from "../shared/protocol.js";

export type SocketClientEvent =
  | {
      type: "result";
      id: string;
      ok: boolean;
      result?: unknown;
      error?: { code: string; message: string; operationId?: string };
    }
  | { type: "event"; event: string; data: unknown }
  | { type: "pair_pending"; pairingId: string; code: string }
  | { type: "pair_result"; approved: boolean; clientId?: string; token?: string; grantedScopes?: McpScope[] };

export type ConnectResult =
  | { ok: true; scopes: McpScope[]; serverInfo: { name: string; version: string } }
  | { ok: false; code: string };

/**
 * Shim-side counterpart to broker/session.ts: connects to the broker's Unix socket/named pipe,
 * performs the hello/challenge/auth handshake using the stored credential, or — when no
 * credential is available yet — the pairing flow, then exposes `call()` for steady-state
 * requests and an event stream for unsolicited pushes.
 *
 * All incoming bytes flow through exactly one line buffer + dispatch path (`onData`/`dispatch`)
 * regardless of protocol phase — `authenticate()` observes handshake messages via `onEvent`
 * rather than attaching a second raw socket listener, so a single TCP chunk spanning a
 * handshake message and the start of the next message is never parsed by two independent
 * buffers (which would risk duplicating or dropping bytes at the boundary).
 */
export class SocketClient {
  private socket: net.Socket | undefined;
  private buffer = "";
  private readonly listeners: Array<(event: SocketClientEvent) => void> = [];
  private readonly pendingCalls = new Map<
    string,
    { resolve: (v: SocketClientEvent) => void; reject: (e: Error) => void }
  >();

  connect(endpointName: string): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(endpointName);
      socket.once("connect", () => {
        socket.removeListener("error", reject);
        this.socket = socket;
        socket.on("data", (chunk) => this.onData(chunk));
        resolve(socket);
      });
      socket.once("error", reject);
    });
  }

  disconnect(): void {
    this.socket?.end();
    this.socket = undefined;
  }

  onEvent(listener: (event: SocketClientEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  private send(message: Record<string, unknown>): void {
    this.socket?.write(JSON.stringify(message) + "\n");
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf-8");
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.length === 0) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      this.dispatch(parsed as { t: string; [key: string]: unknown });
    }
  }

  private dispatch(message: { t: string; [key: string]: unknown }): void {
    switch (message.t) {
      case "result": {
        const id = message.id as string;
        const event: SocketClientEvent = message.ok
          ? { type: "result", id, ok: true, result: message.result }
          : {
              type: "result",
              id,
              ok: false,
              error: message.error as SocketClientEvent extends { error: infer E } ? E : never,
            };
        const pending = this.pendingCalls.get(id);
        if (pending) {
          this.pendingCalls.delete(id);
          pending.resolve(event);
        } else {
          this.emit(event);
        }
        return;
      }
      case "event":
        this.emit({ type: "event", event: message.event as string, data: message.data });
        return;
      case "pair_pending":
        this.emit({ type: "pair_pending", pairingId: message.pairingId as string, code: message.code as string });
        return;
      case "pair_result":
        this.emit({
          type: "pair_result",
          approved: message.approved as boolean,
          clientId: message.clientId as string | undefined,
          token: message.token as string | undefined,
          grantedScopes: message.grantedScopes as McpScope[] | undefined,
        });
        return;
      default:
        // challenge / ready / deny: consumed by authenticate() via onEvent below, surfaced as a
        // generic tagged event so there's exactly one dispatch path for every message type.
        this.emit({ type: "event", event: message.t, data: message });
    }
  }

  private emit(event: SocketClientEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  /** Performs the hello/challenge/auth handshake using an already-issued credential. */
  authenticate(clientId: string, tokenHash: string, endpointName: string, timeoutMs = 10_000): Promise<ConnectResult> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        unsubscribe();
        resolve({ ok: false, code: "TIMEOUT" });
      }, timeoutMs);

      const unsubscribe = this.onEvent((event) => {
        if (event.type !== "event") return;
        if (event.event === "challenge") {
          const nonce = (event.data as { nonce: string }).nonce;
          const mac = computeMac(tokenHash, nonce, endpointName);
          this.send({ t: "auth", clientId, mac });
        } else if (event.event === "ready") {
          clearTimeout(timer);
          unsubscribe();
          const data = event.data as {
            scopes: McpScope[];
            serverInfo: ConnectResult extends { ok: true; serverInfo: infer S } ? S : never;
          };
          resolve({ ok: true, scopes: data.scopes, serverInfo: data.serverInfo });
        } else if (event.event === "deny") {
          clearTimeout(timer);
          unsubscribe();
          resolve({ ok: false, code: (event.data as { code: string }).code });
        }
      });

      this.send({ t: "hello", v: 1, clientId });
    });
  }

  call(id: string, action: BridgeAction, input: unknown, timeoutMs = 30_000): Promise<SocketClientEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCalls.delete(id);
        reject(new Error("SOCKET_CALL_TIMEOUT"));
      }, timeoutMs);
      this.pendingCalls.set(id, {
        resolve: (event) => {
          clearTimeout(timer);
          resolve(event);
        },
        reject,
      });
      this.send({ t: "call", id, action, input });
    });
  }

  requestPairing(clientName: string, requestedScopes: McpScope[]): void {
    this.send({ t: "pair", v: 1, clientName, requestedScopes });
  }
}
