import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";

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
  systemConfig: { get, set },
  message: {},
  subscribeMessage: () => () => {},
}));
vi.mock("@App/pages/store/features/script", () => ({ synchronizeClient: { export: vi.fn(), backupToCloud: vi.fn() } }));
vi.mock("@App/app/migrate", () => ({ migrateToChromeStorage: vi.fn() }));
vi.mock("@App/app/service/service_worker/client", () => ({ SystemClient: vi.fn() }));
vi.mock("@Packages/filesystem/factory", () => ({
  default: { create: vi.fn(), params: () => ({ webdav: { url: { title: "url" } }, "baidu-netdsik": {}, onedrive: {}, googledrive: {}, dropbox: {}, s3: {} }) },
}));
vi.mock("@Packages/filesystem/auth", () => ({
  netDiskTypeMap: {},
  HasNetDiskToken: vi.fn(() => Promise.resolve(false)),
  ClearNetDiskToken: vi.fn(() => Promise.resolve()),
}));

import Tools from "./index";

beforeEach(() => {
  initLanguage("en-US");
  // @ts-expect-error test stub
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
});
afterEach(cleanup);

describe("工具页", () => {
  it("渲染 5 个分类导航项", async () => {
    render(<Tools />);
    await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(5));
  });
});
