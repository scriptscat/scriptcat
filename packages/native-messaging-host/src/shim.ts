#!/usr/bin/env node
// scriptcat-mcp — launched by the MCP client (Claude Code, Claude Desktop, Cursor, etc.), per
// doc 06 §4. Discovers the broker's socket from the host's published config, authenticates (or
// pairs on first run), then serves the MCP protocol over its own stdio via the official SDK.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import * as crypto from "node:crypto";
import { resolveShimConfigDir, loadShimCredentials, saveShimCredentials } from "./shared/shim-config.js";
import { resolveConfigDir } from "./shared/config.js";
import { hostConfigPath } from "./shared/host-config.js";
import { hashToken } from "./auth/token-store.js";
import { SocketClient } from "./shim/socket-client.js";
import { buildMcpServer } from "./shim/server.js";
import type { McpScope } from "./shared/protocol.js";

const SHIM_VERSION = "0.1.0";
const PAIR_TIMEOUT_MS = 2 * 60_000;

function discoverEndpointName(): string {
  const configPath = hostConfigPath(resolveConfigDir());
  const content = readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(content) as { endpointName?: string };
  if (!parsed.endpointName) {
    throw new Error("host config has no published endpoint — is the native host running?");
  }
  return parsed.endpointName;
}

async function runPairing(clientName: string, requestedScopes: McpScope[]): Promise<void> {
  const endpointName = discoverEndpointName();
  const client = new SocketClient();
  await client.connect(endpointName);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("pairing timed out")), PAIR_TIMEOUT_MS);
    const unsubscribe = client.onEvent((event) => {
      if (event.type === "pair_pending") {
        process.stderr.write(`Pairing code: ${event.code}\nConfirm this matches the code shown in ScriptCat.\n`);
        return;
      }
      if (event.type === "pair_result") {
        clearTimeout(timer);
        unsubscribe();
        if (!event.approved || !event.clientId || !event.token) {
          reject(new Error("pairing was rejected"));
          return;
        }
        void saveShimCredentials(resolveShimConfigDir(), {
          clientId: event.clientId,
          token: event.token,
          tokenHash: hashToken(event.token),
          endpointDiscoveryPath: hostConfigPath(resolveConfigDir()),
        }).then(() => {
          process.stderr.write("Paired successfully.\n");
          client.disconnect();
          resolve();
        }, reject);
      }
    });
    client.requestPairing(clientName, requestedScopes);
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--pair")) {
    const nameIndex = args.indexOf("--name");
    const clientName = nameIndex >= 0 ? args[nameIndex + 1] : `scriptcat-mcp@${crypto.randomUUID().slice(0, 8)}`;
    const scopesIndex = args.indexOf("--scopes");
    const scopes = (
      scopesIndex >= 0 ? args[scopesIndex + 1].split(",") : ["scripts:list", "scripts:metadata:read"]
    ) as McpScope[];
    await runPairing(clientName, scopes);
    return;
  }

  const credentials = await loadShimCredentials(resolveShimConfigDir());
  if (!credentials) {
    process.stderr.write('No credentials found. Run: scriptcat-mcp --pair --name "<client name>"\n');
    process.exit(1);
  }

  const endpointName = discoverEndpointName();
  const client = new SocketClient();
  await client.connect(endpointName);
  const authResult = await client.authenticate(credentials.clientId, credentials.tokenHash, endpointName);
  if (!authResult.ok) {
    process.stderr.write(`ScriptCat bridge rejected this client (${authResult.code}). Try re-pairing.\n`);
    process.exit(1);
  }

  let scopes = authResult.scopes;
  client.onEvent((event) => {
    if (event.type === "event" && event.event === "scopes.changed") {
      scopes = (event.data as { scopes: McpScope[] }).scopes;
      // A full tools/list_changed re-registration would require rebuilding and re-connecting
      // the McpServer; deferred to the UI/pairing-dialog commit alongside live scope editing.
    }
  });

  const server = buildMcpServer({ socketClient: client, serverVersion: SHIM_VERSION, getScopes: () => scopes });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  process.stderr.write(`fatal: ${String(e)}\n`);
  process.exit(1);
});
