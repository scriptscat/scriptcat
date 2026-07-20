import type { McpClient, McpClientDAO } from "@App/app/repo/mcp";
import { MCP_SCOPES, SCTL_CLI_CLIENT_ID } from "./types";

// The built-in sctl CLI identity, synthesized rather than read from McpClientDAO — the CLI never
// pairs (design §3.1). Full scope so every verb passes the scope gate; writes still hit the write
// policy + write-session gate + confirm page. Never persisted, so it can't be revoked and never
// shows up in the paired-client list.
export const SCTL_CLI_CLIENT: McpClient = {
  clientId: SCTL_CLI_CLIENT_ID,
  displayName: "sctl (CLI)",
  tokenHash: "",
  scopes: [...MCP_SCOPES],
  createdAt: 0,
  lastUsedAt: 0,
  revoked: false,
};

/**
 * Resolve a requesting client by id. Every lookup on the request/approval path must go through
 * here rather than hitting the DAO directly: sctl-cli exists only as the record above, so a bare
 * `clientDAO.get()` reports it as unknown — which on the approval path reads as "revoked" and
 * rejects a write the human just approved.
 */
export function resolveMcpClient(
  clientDAO: Pick<McpClientDAO, "get">,
  clientId: string
): Promise<McpClient | undefined> {
  if (clientId === SCTL_CLI_CLIENT_ID) {
    return Promise.resolve(SCTL_CLI_CLIENT);
  }
  return clientDAO.get(clientId);
}
