import { describe, expect, it, vi } from "vitest";
import { initTestEnv } from "@Tests/utils";
import { RuntimeService } from "./runtime";
import { SenderRuntime, type Group } from "@Packages/message/server";
import { RequestSequenceWindow } from "@Packages/message/request_sequence_window";
import type { IMessageQueue } from "@Packages/message/message_queue";
import type { ServiceWorkerMessageSend, WindowMessageBody } from "@Packages/message/window_message";
import type { MessageConnect, TMessage } from "@Packages/message/types";
import type { SystemConfig } from "@App/pkg/config/config";
import type { ValueService } from "./value";
import type { ScriptService } from "./script";
import type { ResourceService } from "./resource";
import type { ScriptDAO } from "@App/app/repo/scripts";
import { LocalStorageDAO } from "@App/app/repo/localStorage";

initTestEnv();

const PAGE_URL = "https://example.com/page";

const createRuntime = () => {
  const group = { use: vi.fn().mockReturnThis() } as unknown as Group;
  const sender = {
    async init() {},
    messageHandle(_data: WindowMessageBody) {},
    async connect(_data: TMessage): Promise<MessageConnect> {
      return {} as MessageConnect;
    },
    async sendMessage<T = any>(_data: TMessage): Promise<T> {
      return {} as T;
    },
  } as ServiceWorkerMessageSend;
  const mq = { group: vi.fn().mockReturnValue(group) } as unknown as IMessageQueue;
  return new RuntimeService(
    {} as SystemConfig,
    group,
    sender,
    mq,
    {} as ValueService,
    {} as ScriptService,
    {} as ResourceService,
    { all: vi.fn().mockResolvedValue([]) } as unknown as ScriptDAO,
    new LocalStorageDAO()
  );
};

const makeSender = () =>
  new SenderRuntime(
    {
      tab: { id: 1 },
      frameId: 0,
      url: PAGE_URL,
    } as any,
    "extension"
  );

const makeRecord = (token: string, mode: "pending" | "native" | "fallback" = "pending") => ({
  transportToken: token,
  tabId: 1,
  frameId: 0,
  url: PAGE_URL,
  lifecycle: "active",
  lastLifecycleSequence: 0,
  handles: new Set(["handle"]),
  delivery: { pendingValueUpdates: new Map(), pendingEmitEvents: [] },
  mode,
  fallbackEligibleAt: 0,
  scripts: [{ uuid: "script", executionHandle: "handle" }],
  envInfo: { userAgentData: {}, sandboxMode: "raw", isIncognito: false },
});

describe("RuntimeService MAIN transport state machine", () => {
  it("keeps reconnect inside native mode and reuses one pending reconnect bootstrap", () => {
    const runtime = createRuntime() as any;
    const record = makeRecord("token", "native");
    runtime.mainTransportRecords.set("token", record);
    runtime.pageExecutionBindings.set("handle", {
      handle: "handle",
      uuid: "script",
      envTag: "it",
      runFlag: "run",
      url: PAGE_URL,
      tabId: 1,
      frameId: 0,
      transportToken: "token",
      storageName: "script",
      allowedAPIs: new Set(["GM_getValue"]),
      requestSequenceWindow: new RequestSequenceWindow(),
    });
    runtime.userScriptSessions.set("main:token", {
      scripts: [{ uuid: "script", executionHandle: "handle" }],
      envInfo: {},
      reconnectToken: "reconnect",
      envTag: "it",
      url: PAGE_URL,
      tabId: 1,
      frameId: 0,
      transport: "extension",
      transportToken: "token",
      pendingValueUpdates: new Map(),
    });
    runtime.userScriptBootstraps.set("other-generation-bootstrap", {
      scripts: [],
      envInfo: {},
      reconnectToken: "other",
      envTag: "it",
      url: PAGE_URL,
      tabId: 1,
      frameId: 0,
      transportToken: "other-token",
      pendingValueUpdates: new Map(),
    });

    const first = runtime.reconnectUserScript({ reconnectToken: "reconnect" }, makeSender());
    const second = runtime.reconnectUserScript({ reconnectToken: "reconnect" }, makeSender());

    expect(first?.bootstrapToken).toBeTruthy();
    expect(second).toEqual(first);
    expect(record.mode).toBe("native");
    expect(record.pendingReconnect?.bootstrapToken).toBe(first?.bootstrapToken);
    expect(runtime.userScriptBootstraps.has("other-generation-bootstrap")).toBe(true);
  });

  it("selects fallback only while active and invalidates the initial native candidate", async () => {
    const runtime = createRuntime() as any;
    const record = makeRecord("token");
    record.bootstrapToken = "token";
    runtime.mainTransportRecords.set("token", record);
    runtime.userScriptBootstraps.set("token", {
      scripts: record.scripts,
      envInfo: record.envInfo,
      reconnectToken: "native-reconnect",
      envTag: "it",
      url: PAGE_URL,
      tabId: 1,
      frameId: 0,
      transportToken: "token",
      pendingValueUpdates: new Map(),
    });
    const disconnect = vi.fn();
    runtime.pendingMainCandidates.set("token", {
      connection: { disconnect } as unknown as MessageConnect,
      handles: new Set(["handle"]),
      bootstrapToken: "token",
    });

    expect((await runtime.resolveMainTransport({ transportToken: "token" }, makeSender())).mode).toBe("fallback");
    expect(record.mode).toBe("fallback");
    expect(disconnect).toHaveBeenCalled();
    expect(runtime.pendingMainCandidates.has("token")).toBe(false);
    expect(runtime.userScriptBootstraps.has("token")).toBe(false);

    const dormant = makeRecord("dormant");
    dormant.lifecycle = "dormant";
    runtime.mainTransportRecords.set("dormant", dormant);
    expect((await runtime.resolveMainTransport({ transportToken: "dormant" }, makeSender())).mode).toBe("pending");
    expect(dormant.mode).toBe("pending");
  });

  it("ignores stale same-generation lifecycle messages", async () => {
    const runtime = createRuntime() as any;
    const record = makeRecord("token", "native");
    runtime.mainTransportRecords.set("token", record);
    runtime.activeMainTransportByFrame.set("1:0", "token");

    await runtime.mainTransportLifecycle(
      { transportToken: "token", lifecycleSequence: 2, event: "pagehide", persisted: true },
      makeSender()
    );
    expect(record.lifecycle).toBe("dormant");

    await runtime.mainTransportLifecycle(
      { transportToken: "token", lifecycleSequence: 3, event: "pageshow", persisted: true },
      makeSender()
    );
    expect(record.lifecycle).toBe("active");

    const stale = await runtime.mainTransportLifecycle(
      { transportToken: "token", lifecycleSequence: 2, event: "pagehide", persisted: false },
      makeSender()
    );
    expect(stale.stale).toBe(true);
    expect(record.lifecycle).toBe("active");
    expect(runtime.mainTransportRecords.has("token")).toBe(true);
  });
});
