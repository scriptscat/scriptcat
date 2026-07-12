import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import { atomicWriteFile } from "../shared/config.js";
import type { McpScope } from "../shared/protocol.js";

export interface StoredClient {
  clientId: string;
  displayName: string;
  tokenHash: string; // hex SHA-256(token) — the raw token is never stored host-side
  scopes: McpScope[];
  createdAt: number;
  lastUsedAt: number;
  revoked: boolean;
}

/** 256-bit random token (doc 04 §8). */
export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf-8").digest("hex");
}

/**
 * Authoritative client/token registry, persisted to `clients.json` in the host's config dir
 * (`0600`, doc 06 §2). Never holds a raw token past the moment it's generated for the pairing
 * response — only its hash survives.
 */
export class TokenStore {
  private clients = new Map<string, StoredClient>();

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.filePath, "utf-8");
      const data = JSON.parse(content) as StoredClient[];
      this.clients = new Map(data.map((c) => [c.clientId, c]));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      this.clients = new Map();
    }
  }

  private persist(): Promise<void> {
    return atomicWriteFile(this.filePath, JSON.stringify([...this.clients.values()]));
  }

  async addClient(client: Omit<StoredClient, "revoked">): Promise<void> {
    this.clients.set(client.clientId, { ...client, revoked: false });
    await this.persist();
  }

  get(clientId: string): StoredClient | undefined {
    return this.clients.get(clientId);
  }

  list(): StoredClient[] {
    return [...this.clients.values()];
  }

  /** Finds the (non-revoked) client whose stored hash matches — used on every auth handshake. */
  findByTokenHash(tokenHash: string): StoredClient | undefined {
    for (const client of this.clients.values()) {
      if (!client.revoked && client.tokenHash === tokenHash) return client;
    }
    return undefined;
  }

  async revoke(clientId: string): Promise<boolean> {
    const client = this.clients.get(clientId);
    if (!client) return false;
    client.revoked = true;
    await this.persist();
    return true;
  }

  async touchLastUsed(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;
    client.lastUsedAt = Date.now();
    await this.persist();
  }

  async updateScopes(clientId: string, scopes: McpScope[]): Promise<boolean> {
    const client = this.clients.get(clientId);
    if (!client) return false;
    client.scopes = scopes;
    await this.persist();
    return true;
  }
}
