import { describe, expect, it } from "vitest";
import { ScriptEnvTag } from "@Packages/message/consts";
import { CustomEventMessage } from "@Packages/message/custom_event_message";
import { Server } from "@Packages/message/server";
import type { ScriptRunResource } from "@App/app/repo/scripts";
import { ScriptExecutor } from "../script_executor";
import { ScriptRuntime } from "../script_runtime";
import GMApi from "./gm_api";

let flagCounter = 0;

function createApiWithContentRuntime() {
  const eventFlag = `related-target-lifecycle-test-${++flagCounter}`;
  const sender = new CustomEventMessage(eventFlag, false, "");
  const receiver = new CustomEventMessage(eventFlag, true, "");
  const server = new Server("content", receiver);
  const runtime = new ScriptRuntime(
    ScriptEnvTag.content,
    server,
    receiver,
    new ScriptExecutor(receiver, receiver),
    undefined
  );
  runtime.contentInit();

  const scriptRes: ScriptRunResource = {
    uuid: "related-target-lifecycle-test",
    name: "related-target-lifecycle-test",
    namespace: "test",
    metadata: {},
    sort: 0,
    type: 1,
    status: 1,
    runStatus: "complete",
    createtime: 0,
    checktime: 0,
    code: "",
    value: {},
    flag: "related-target-lifecycle-test",
    resource: {},
    originalMetadata: {},
  };
  const api = new GMApi("test", sender, sender, scriptRes);
  return { api, sender, receiver };
}

describe("relatedTarget lifecycle across content runtime callers", () => {
  it("consumes returned elements and parent nodes for GM DOM operations", () => {
    const { api, sender, receiver } = createApiWithContentRuntime();
    const parent = document.createElement("section");

    try {
      const style = api.GM_addStyle("body { color: red; }");
      expect(style?.tagName).toBe("STYLE");
      expect(style?.textContent).toBe("body { color: red; }");
      expect(sender.relatedTarget).toHaveProperty("size", 0);
      expect(receiver.relatedTarget).toHaveProperty("size", 0);

      const child = api.GM_addElement(parent, "span", { id: "child" });
      expect(child?.parentNode).toBe(parent);
      expect(child?.id).toBe("child");
      expect(sender.relatedTarget).toHaveProperty("size", 0);
      expect(receiver.relatedTarget).toHaveProperty("size", 0);

      const root = api.GM_addElement("div", { id: "root" });
      expect(root?.tagName).toBe("DIV");
      expect(root?.id).toBe("root");
      expect(sender.relatedTarget).toHaveProperty("size", 0);
      expect(receiver.relatedTarget).toHaveProperty("size", 0);
    } finally {
      sender.relatedTarget.clear();
      receiver.relatedTarget.clear();
    }
  });
});
