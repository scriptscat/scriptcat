import { describe, expect, it, vi } from "vitest";
import type ExecScript from "./exec_script";
import { ScriptExecutor } from "./script_executor";
import type { ValueUpdateDataEncoded } from "./types";
import type { Message } from "@Packages/message/types";
import { encodeRValue } from "@App/pkg/utils/message_value";

const response = (uuid: string, id: string, value: string): ValueUpdateDataEncoded => ({
  id,
  valueChanges: [["key", encodeRValue(value), encodeRValue("previous")]],
  uuid,
  storageName: "shared",
  sender: { runFlag: "worker", tabId: -2 },
});

describe("ScriptExecutor value updates", () => {
  it("preserves interleaved updates from scripts sharing a storageName", () => {
    const executor = new ScriptExecutor({} as Message, {} as Message);
    const update = vi.fn();
    executor.execScriptMap.set("script-a", { valueUpdate: update } as unknown as ExecScript);

    executor.valueUpdate({
      storageName: "shared",
      storageChanges: [
        response("script-a", "a1", "a1"),
        response("script-b", "b1", "b1"),
        response("script-a", "a2", "a2"),
      ],
    });

    expect(update.mock.calls.map(([, uuid, responses]) => [uuid, responses[0].id])).toEqual([
      ["script-a", "a1"],
      ["script-b", "b1"],
      ["script-a", "a2"],
    ]);
  });
});
