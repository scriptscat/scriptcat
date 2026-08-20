import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { scenarioDir } from "../e2e/session.mjs";

const createdScenarios = new Set();

function testScenario(name) {
  const scenario = `verification-tools-${process.pid}-${name}`;
  createdScenarios.add(scenario);
  return scenario;
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

afterEach(() => {
  for (const scenario of createdScenarios) {
    fs.rmSync(scenarioDir(scenario), { recursive: true, force: true });
  }
  createdScenarios.clear();
});

describe("verification session paths", () => {
  it("rejects scenario names that escape the scratch directory", () => {
    expect(() => scenarioDir("../outside")).toThrow(/scenario/i);
  });

  it("stop --all terminates a session that is still starting", async () => {
    const scenario = testScenario("starting");
    const dir = scenarioDir(scenario);
    fs.mkdirSync(dir, { recursive: true });
    const daemon = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    if (!daemon.pid) throw new Error("failed to start test daemon");
    fs.writeFileSync(path.join(dir, ".session.lock"), `${JSON.stringify({ pid: daemon.pid, token: "test-lock" })}\n`);

    try {
      const result = spawnSync(process.execPath, ["e2e/session.mjs", "stop", "--all"], {
        cwd: process.cwd(),
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(processIsAlive(daemon.pid)).toBe(false);
      expect(fs.existsSync(path.join(dir, ".session.lock"))).toBe(false);
    } finally {
      if (processIsAlive(daemon.pid)) process.kill(daemon.pid, "SIGKILL");
    }
  }, 5_000);

  it("reports when the console collector disconnects after startup", async () => {
    const { attachConsoleCollector } = await import("../e2e/session.mjs");
    expect(typeof attachConsoleCollector).toBe("function");

    const server = createServer();
    const webSockets = new WebSocketServer({ server });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server has no TCP port");
    const fetchVersion = async () => ({
      json: async () => ({ webSocketDebuggerUrl: `ws://127.0.0.1:${address.port}` }),
    });

    try {
      const disconnected = new Promise((resolve) => {
        void attachConsoleCollector(
          address.port,
          () => {},
          () => resolve(),
          fetchVersion
        );
      });
      const peer = await new Promise((resolve) => webSockets.once("connection", resolve));
      peer.close();

      await expect(disconnected).resolves.toBeUndefined();
    } finally {
      webSockets.close();
      await new Promise((resolve) => server.close(resolve));
    }
  }, 5_000);

  it("keeps the selected page when two pages have the same URL", async () => {
    const { activePage } = await import("../e2e/drive.mjs");
    expect(typeof activePage).toBe("function");

    const scenario = testScenario("active-page");
    const dir = scenarioDir(scenario);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".active"),
      `${JSON.stringify({ targetId: "target-b", url: "https://example.test/same" })}\n`
    );
    const pages = [
      { id: "target-a", url: () => "https://example.test/same" },
      { id: "target-b", url: () => "https://example.test/same" },
    ];
    const context = {
      pages: () => pages,
      newCDPSession: async (page) => ({
        send: async () => ({ targetInfo: { targetId: page.id } }),
        detach: async () => {},
      }),
    };

    await expect(activePage(context, { scenario })).resolves.toBe(pages[1]);
  });
});
