import { describe, it, expect, vi } from "vitest";
import { initTestEnv } from "@Tests/utils";
import { MockMessage } from "@Packages/message/mock_message";
import { Server } from "@Packages/message/server";
import EventEmitter from "eventemitter3";
import type { Message } from "@Packages/message/types";
import { SandboxManager } from "./index";

initTestEnv();

describe("SandboxManager private-port startup", () => {
  it("wires runtime first and fetches extension env without a second readiness RPC", async () => {
    const bus = new MockMessage(new EventEmitter<string, any>());
    const offscreenServer = new Server("offscreen", bus);
    const getExtensionEnv = vi.fn().mockReturnValue({ inIncognitoContext: false });
    const legacyPreparation = vi.fn();
    const legacyHealth = vi.fn();
    offscreenServer.on("getExtensionEnv", getExtensionEnv);
    offscreenServer.on("preparationSandbox", legacyPreparation);
    offscreenServer.on("reportSandboxChannelHealth", legacyHealth);

    const manager = new SandboxManager(bus as unknown as Message);
    manager.initManager();

    await Promise.resolve();
    await Promise.resolve();

    expect(getExtensionEnv).toHaveBeenCalledTimes(1);
    expect(legacyPreparation).not.toHaveBeenCalled();
    expect(legacyHealth).not.toHaveBeenCalled();
  });
});
