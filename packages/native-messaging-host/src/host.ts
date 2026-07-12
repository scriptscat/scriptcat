#!/usr/bin/env node
// scriptcat-native-host — launched by the browser via chrome.runtime.connectNative (doc 06 §3).
// Never interprets script content and has no network access at all (no fetch anywhere in this
// file or anything it imports — URL retrieval lives entirely in the extension, doc 04 §5).

import * as fs from "node:fs/promises";
import * as crypto from "node:crypto";
import { verifyCallerOrigin } from "./native/origin.js";
import { resolveConfigDir, verifyDirPermissions } from "./shared/config.js";
import { loadHostConfig, saveHostConfig, clientsPath, runtimeDir } from "./shared/host-config.js";
import { resolveLimits } from "./shared/limits.js";
import { Logger } from "./shared/logging.js";
import { TokenStore } from "./auth/token-store.js";
import { PairingManager } from "./auth/pairing.js";
import { AuthFailureLockout, ConcurrencyLimiter, WindowedRateLimiter } from "./broker/rate-limit.js";
import { createIpcEndpoint } from "./broker/ipc.js";
import { BrokerServer } from "./broker/server.js";
import { handlePairingDecision, type PairDecisionPayload } from "./broker/pairing-decision.js";
import { NativeChannel } from "./native/channel.js";
import type { McpBridgeRequest, McpBridgeResponse } from "./shared/protocol.js";

const HOST_VERSION = "0.1.0";
const logger = new Logger("host");

async function main(): Promise<void> {
  if (process.argv.includes("--doctor")) {
    await runDoctor();
    return;
  }

  const configDir = resolveConfigDir();
  await fs.mkdir(configDir, { recursive: true });
  const dirCheck = await verifyDirPermissions(configDir);
  if (!dirCheck.ok) {
    logger.error("config dir failed permission check", { reason: dirCheck.reason });
    process.exit(1);
  }

  const hostConfig = await loadHostConfig(configDir);
  const originCheck = verifyCallerOrigin(process.argv, hostConfig.allowedOrigins);
  if (!originCheck.ok) {
    // doc 04 §3: log only the rejected origin string, truncated, never the full argv.
    logger.error("caller origin rejected", { reason: originCheck.reason });
    process.exit(1);
  }

  const limits = resolveLimits(hostConfig.limitOverrides);

  const tokenStore = new TokenStore(clientsPath(configDir));
  await tokenStore.load();
  const pairingManager = new PairingManager();
  const authFailureLockout = new AuthFailureLockout(
    limits.authFailuresPerMinutePerEndpoint,
    60_000,
    limits.authLockoutMs
  );
  const readLimiter = new WindowedRateLimiter(limits.readCallsPerMinutePerClient, 60_000);
  const writeLimiter = new WindowedRateLimiter(limits.writeRequestsPerHourPerClient, 60 * 60_000);

  const runDir = runtimeDir(configDir);
  await fs.mkdir(runDir, { recursive: true, mode: 0o700 });
  await fs.chmod(runDir, 0o700);

  const endpoint = await createIpcEndpoint(runDir);
  await saveHostConfig(configDir, { ...hostConfig, endpointName: endpoint.endpointName });

  const channel = new NativeChannel(limits.nativeMessageMaxBytes, limits.requestTimeoutMs, (buf) => {
    process.stdout.write(buf);
  });

  const server = new BrokerServer(endpoint, (connectionId, send) => ({
    connectionId,
    endpointName: endpoint.endpointName,
    serverInfo: { name: "scriptcat-native-host", version: HOST_VERSION },
    tokenStore,
    pairingManager,
    authFailureLockout,
    readLimiter,
    writeLimiter,
    concurrencyLimiter: new ConcurrencyLimiter(limits.concurrentCallsPerClient),
    send,
    dispatchBridgeCall: async (clientId, action, input) => {
      const request: McpBridgeRequest = { requestId: crypto.randomUUID(), protocolVersion: 1, clientId, action, input };
      try {
        const response = (await channel.request("bridge.request", request)) as McpBridgeResponse;
        return response.ok ? { ok: true, result: response.result } : { ok: false, error: response.error };
      } catch {
        return { ok: false, error: { code: "INTERNAL_ERROR", message: "extension unreachable" } };
      }
    },
    onPairingRequested: (params) => channel.send("pair.request", params),
  }));

  channel.onMessage((envelope) => {
    switch (envelope.type) {
      case "pair.decision":
        void handlePairingDecision(
          { pairingManager, tokenStore, getSession: (id) => server.getSession(id) },
          envelope.payload as PairDecisionPayload
        );
        return;
      case "client.revoke": {
        const { clientId } = envelope.payload as { clientId: string };
        void tokenStore.revoke(clientId);
        return;
      }
      case "bridge.shutdown":
        void shutdown(0);
        return;
      default:
        return;
    }
  });

  process.stdin.on("data", (chunk: Buffer) => channel.feed(chunk));
  process.stdin.on("end", () => {
    channel.rejectAllPending(new Error("native channel closed"));
    void shutdown(0);
  });
  process.stdin.resume();

  const pingTimer = setInterval(() => channel.send("ping", {}), limits.pingIntervalMs);

  async function shutdown(code: number): Promise<void> {
    clearInterval(pingTimer);
    await server.close();
    process.exit(code);
  }

  process.on("unhandledRejection", (err) => {
    logger.error("unhandled rejection", { error: String(err) });
    process.exit(1);
  });
}

async function runDoctor(): Promise<void> {
  const configDir = resolveConfigDir();
  const results: Array<{ check: string; ok: boolean; detail?: string }> = [];

  try {
    await fs.mkdir(configDir, { recursive: true });
    results.push({ check: "config dir creatable", ok: true });
  } catch (e) {
    results.push({ check: "config dir creatable", ok: false, detail: String(e) });
  }

  const dirCheck = await verifyDirPermissions(configDir);
  results.push({ check: "config dir permissions", ok: dirCheck.ok, detail: dirCheck.ok ? undefined : dirCheck.reason });

  const hostConfig = await loadHostConfig(configDir);
  results.push({
    check: "allowed origins configured",
    ok: hostConfig.allowedOrigins.length > 0,
    detail: hostConfig.allowedOrigins.length > 0 ? undefined : "run the installer to register an extension ID",
  });

  results.push({ check: "node version", ok: true, detail: process.version });

  for (const result of results) {
    process.stderr.write(`${result.ok ? "✓" : "✗"} ${result.check}${result.detail ? ` (${result.detail})` : ""}\n`);
  }
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch((e) => {
  logger.error("fatal", { error: String(e) });
  process.exit(1);
});
