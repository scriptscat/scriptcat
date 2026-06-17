import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";

const { get, set } = vi.hoisted(() => ({
  get: vi.fn((key: string) => {
    if (key === "cloud_sync")
      return Promise.resolve({ enable: false, syncDelete: false, syncStatus: true, filesystem: "webdav", params: {} });
    if (key === "cat_file_storage") return Promise.resolve({ status: "unset", filesystem: "webdav", params: {} });
    return Promise.resolve("scriptcat");
  }),
  set: vi.fn(),
}));
vi.mock("@App/pages/store/global", () => ({ systemConfig: { get, set }, subscribeMessage: () => () => {} }));

import Setting from "./index";

beforeEach(() => {
  initLanguage("en-US");
  // jsdom 未实现 matchMedia(useIsMobile 用),固定返回 desktop
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
  // jsdom doesn't provide IntersectionObserver — stub it
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

describe("设置页", () => {
  it("渲染 7 个分类导航项", async () => {
    render(<Setting />);
    await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(7));
  });
});
