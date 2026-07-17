import { describe, it, expect, vi, beforeAll, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockIntersectionObserver } from "@Tests/mockIntersectionObserver";
import { mockMatchMedia } from "@Tests/mockMatchMedia";

const { get, set } = vi.hoisted(() => ({
  get: vi.fn((key: string) => {
    if (key === "cloud_sync")
      return Promise.resolve({ enable: false, syncDelete: false, syncStatus: true, filesystem: "webdav", params: {} });
    if (key === "cat_file_storage") return Promise.resolve({ status: "unset", filesystem: "webdav", params: {} });
    if (key === "editor_preferences")
      return Promise.resolve({ version: 1, fontSize: 14, mouseWheelScrollSensitivity: 1, smoothScrolling: true });
    if (key === "editor_config") return Promise.resolve("{}");
    if (key === "editor_type_definition") return Promise.resolve("declare const GM_info: unknown;");
    if (key === "enable_eslint") return Promise.resolve(false);
    if (key === "eslint_config") return Promise.resolve("{}");
    return Promise.resolve("scriptcat");
  }),
  set: vi.fn(),
}));
vi.mock("@App/pages/store/global", async () => {
  const { createGlobalStoreMock } = await import("@Tests/mocks/pageStores.ts");
  return createGlobalStoreMock({ systemConfig: { get, set } });
});
vi.mock("./sections/GeneralSection", () => ({ GeneralSection: () => null }));
vi.mock("./sections/InterfaceSection", () => ({ InterfaceSection: () => null }));
vi.mock("./sections/SyncSection", () => ({ SyncSection: () => null }));
vi.mock("./sections/UpdateSection", () => ({ UpdateSection: () => null }));
vi.mock("./sections/RuntimeSection", () => ({ RuntimeSection: () => null }));
vi.mock("./sections/SecuritySection", () => ({ SecuritySection: () => null }));
vi.mock("./sections/DeveloperSection", () => ({ DeveloperSection: () => null }));
vi.mock("./sections/DeveloperMonacoEditor", () => ({
  DeveloperMonacoEditor: ({ ariaLabel }: { ariaLabel: string }) => <textarea aria-label={ariaLabel} />,
}));
import Setting from "./index";

beforeAll(() => initTestLanguage("en-US"));

beforeEach(() => {
  mockMatchMedia();
  mockIntersectionObserver();
});
afterEach(cleanup);

describe("设置页", () => {
  it("渲染 7 个分类导航项", () => {
    render(<Setting />);
    expect(document.querySelectorAll("nav button")).toHaveLength(7);
  });
});
