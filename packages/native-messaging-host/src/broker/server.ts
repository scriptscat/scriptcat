import type * as net from "node:net";
import * as crypto from "node:crypto";
import { SessionHandler, type SessionDeps } from "./session.js";
import type { HostToShimMessage } from "./messages.js";
import type { IpcEndpoint } from "./ipc.js";
import { LIMITS } from "../shared/limits.js";

export type SessionDepsFactory = (connectionId: string, send: (message: HostToShimMessage) => void) => SessionDeps;

/**
 * Accepts connections on an IpcEndpoint, decodes doc 03 §4's line-delimited JSON framing
 * (`\n`-terminated, max 4 MiB/line), and hands each parsed message to that connection's
 * SessionHandler. Malformed or oversize lines are dropped individually — same "don't
 * desynchronize the stream" discipline as native/framing.ts, just for the socket side of the
 * protocol rather than the native-messaging side.
 */
export class BrokerServer {
  private sessions = new Map<string, SessionHandler>();

  constructor(
    private readonly endpoint: IpcEndpoint,
    private readonly sessionDepsFactory: SessionDepsFactory,
    private readonly maxLineBytes: number = LIMITS.socketLineMaxBytes
  ) {
    this.endpoint.server.on("connection", (socket) => this.handleConnection(socket));
  }

  private handleConnection(socket: net.Socket): void {
    const connectionId = crypto.randomUUID();
    const send = (message: HostToShimMessage): void => {
      socket.write(JSON.stringify(message) + "\n");
    };
    const session = new SessionHandler(this.sessionDepsFactory(connectionId, send));
    this.sessions.set(connectionId, session);

    let buffer = "";
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        this.processLine(session, line);
      }
      if (Buffer.byteLength(buffer, "utf-8") > this.maxLineBytes) {
        // No newline yet but already past the cap — drop the partial line rather than let an
        // attacker grow this connection's buffer without bound.
        buffer = "";
      }
    });

    const cleanup = (): void => {
      session.close();
      this.sessions.delete(connectionId);
    };
    socket.on("close", cleanup);
    socket.on("error", cleanup);
  }

  private processLine(session: SessionHandler, line: string): void {
    if (line.length === 0) return;
    if (Buffer.byteLength(line, "utf-8") > this.maxLineBytes) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return; // malformed line: ignore this one message, keep the connection alive
    }
    void session.onMessage(parsed);
  }

  getSession(connectionId: string): SessionHandler | undefined {
    return this.sessions.get(connectionId);
  }

  async close(): Promise<void> {
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
    await this.endpoint.close();
  }
}
