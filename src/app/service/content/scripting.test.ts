import { describe, expect, it, vi, afterEach } from "vitest";
import type { MessageSend } from "@Packages/message/types";
import type { TClientPageLoadInfo, TScriptInfo } from "@App/app/repo/scripts";
import type { Server } from "@Packages/message/server";
import { RuntimeClient } from "../service_worker/client";
import ScriptingRuntime, { serializeDocumentResponse } from "./scripting";

const makeSender = () => ({
  sendMessage: vi.fn().mockResolvedValue({ code: 0, data: undefined }),
  connect: vi.fn(),
});

const makeScript = (uuid: string): TScriptInfo =>
  ({
    uuid,
    metadata: { grant: ["GM_getValue"] },
    resource: {},
    value: {},
    flag: `${uuid}-flag`,
    code: "",
  }) as unknown as TScriptInfo;

describe("ScriptingRuntime page bootstrap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests the combined page list so USER_SCRIPT content receives its bootstrap", async () => {
    const pageLoad = vi.spyOn(RuntimeClient.prototype, "pageLoad").mockResolvedValue({
      ok: true,
      injectScriptList: [makeScript("inject-script")],
      contentScriptList: [makeScript("content-script")],
      envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
      userScriptBootstrapToken: "bootstrap-token",
      userScriptInjectBootstrapToken: "inject-bootstrap-token",
    } as TClientPageLoadInfo);
    const senderToExt = makeSender();
    const senderToContent = makeSender();
    const senderToInject = makeSender();
    const runtime = new ScriptingRuntime(
      {} as Server,
      {} as Server,
      senderToExt as unknown as MessageSend,
      senderToContent as any,
      senderToInject as any
    );

    runtime.pageLoad();
    await Promise.resolve();
    await Promise.resolve();

    expect(pageLoad).toHaveBeenCalledWith("it");
    expect(senderToContent.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "content/pageLoad",
        data: expect.objectContaining({
          bootstrapToken: "bootstrap-token",
          extensionOrigin: {
            protocol: "chrome-extension:",
            hostname: chrome.runtime.id,
            port: "",
          },
        }),
      })
    );
    expect(senderToInject.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "inject/bootstrap",
        data: { bootstrapToken: "inject-bootstrap-token" },
      })
    );
    expect(senderToInject.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ action: "inject/pageLoad" }));
  });

  it("serializes CAT_fetchDocument responses instead of returning a live document reference", () => {
    const document = new DOMParser().parseFromString("<html><body><main>ok</main></body></html>", "text/html");
    expect(serializeDocumentResponse(document, "text/html")).toEqual({
      text: expect.stringContaining("<main>ok</main>"),
      contentType: "text/html",
    });
  });
});
