import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtensionMessage } from "./extension_message";

describe("ExtensionMessage RPC response", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lastError rejects instead of resolving an absent response", async () => {
    const runtime = {
      lastError: { message: "Extension context invalidated" },
      sendMessage: vi.fn((_request: unknown, callback: (response: unknown) => void) => callback(undefined)),
    };
    vi.stubGlobal("chrome", { runtime });
    await expect(new ExtensionMessage().sendMessage({ action: "test" })).rejects.toThrow(
      "Extension context invalidated"
    );
  });

  it("successful void payload remains a valid transport response", async () => {
    const runtime = {
      lastError: undefined,
      sendMessage: vi.fn((_request: unknown, callback: (response: unknown) => void) =>
        callback({ code: 0, data: undefined })
      ),
    };
    vi.stubGlobal("chrome", { runtime });
    await expect(new ExtensionMessage().sendMessage({ action: "test" })).resolves.toEqual({
      code: 0,
      data: undefined,
    });
  });
});
