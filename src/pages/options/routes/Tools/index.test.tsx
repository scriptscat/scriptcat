import { describe, it, expect, vi, beforeAll, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockIntersectionObserver } from "@Tests/mockIntersectionObserver";
import { mockMatchMedia } from "@Tests/mockMatchMedia";

const { get, set } = vi.hoisted(() => ({
  get: vi.fn((key: string) => {
    if (key === "backup") return Promise.resolve({ filesystem: "webdav", params: {} });
    if (key === "vscode_url") return Promise.resolve("ws://localhost:8642");
    if (key === "vscode_reconnect") return Promise.resolve(false);
    return Promise.resolve("");
  }),
  set: vi.fn(),
}));
vi.mock("@App/pages/store/global", () => ({
  systemConfig: {
    get,
    set,
    getMcpWritePolicy: () => Promise.resolve("approval"),
    getMcpUrl: () => Promise.resolve("ws://127.0.0.1:8643"),
  },
  message: {},
  subscribeMessage: () => () => {},
}));
vi.mock("@App/pages/store/features/script", () => ({ synchronizeClient: { export: vi.fn(), backupToCloud: vi.fn() } }));
vi.mock("@App/app/migrate", () => ({ migrateToChromeStorage: vi.fn() }));
vi.mock("@App/app/service/service_worker/client", () => ({
  SystemClient: vi.fn(),
  // MCP 卡片常显后其挂载 effect 会 new MCPClient 拉取状态；桩掉读取方法，避免未 mock 抛未捕获错误。
  MCPClient: class {
    getBridgeStatus() {
      return Promise.resolve("disabled");
    }
    getWriteSession() {
      return Promise.resolve(false);
    }
    getClients() {
      return Promise.resolve([]);
    }
    getAudit() {
      return Promise.resolve([]);
    }
    getPendingOperations() {
      return Promise.resolve([]);
    }
    reopenOperation() {
      return Promise.resolve();
    }
    pair() {
      return Promise.resolve();
    }
  },
}));
vi.mock("@Packages/filesystem/factory", () => ({
  default: {
    create: vi.fn(),
    params: () => ({
      webdav: { url: { title: "url" } },
      "baidu-netdsik": {},
      onedrive: {},
      googledrive: {},
      dropbox: {},
      s3: {},
    }),
  },
}));
vi.mock("@Packages/filesystem/auth", () => ({
  netDiskTypeMap: {},
  HasNetDiskToken: vi.fn(() => Promise.resolve(false)),
  ClearNetDiskToken: vi.fn(() => Promise.resolve()),
}));

import Tools from "./index";

beforeAll(() => initTestLanguage("en-US"));

beforeEach(() => {
  mockMatchMedia();
  mockIntersectionObserver();
});
afterEach(cleanup);

describe("工具页", () => {
  it("渲染 6 个分类导航项（含 MCP 桥接入口）", () => {
    render(
      <MemoryRouter>
        <Tools />
      </MemoryRouter>
    );
    const nav = document.querySelector("nav")!;
    // 非 Firefox 下 MCP 桥接卡片常显（内置默认关闭，卡片是启用入口），共 6 项。
    expect(nav.querySelectorAll("button")).toHaveLength(6);
  });
});
