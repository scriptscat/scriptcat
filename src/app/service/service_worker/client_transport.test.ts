import { describe, expect, it, vi } from "vitest";
import type { MessageSend } from "@Packages/message/types";
import { MessageResponseLostError } from "@Packages/message/errors";
import { NetworkRuleAmbiguousResponseError, NetworkRuleClient } from "./client";

describe("Network Rules ambiguous transport responses", () => {
  it("a lost mutation response remains ambiguous, not a confirmed failed write", async () => {
    const sender = {
      sendMessage: vi.fn().mockRejectedValue(new MessageResponseLostError("message channel closed")),
    } as unknown as MessageSend;
    const client = new NetworkRuleClient(sender);
    await expect(client.retryApply()).rejects.toBeInstanceOf(NetworkRuleAmbiguousResponseError);
  });

  it("an explicit server-side failure retains its structured error code", async () => {
    const sender = {
      sendMessage: vi.fn().mockResolvedValue({
        code: -1,
        message: JSON.stringify({ code: "revision_conflict" }),
      }),
    } as unknown as MessageSend;
    const client = new NetworkRuleClient(sender);
    await expect(client.retryApply()).rejects.toEqual({ code: "revision_conflict" });
  });
});
