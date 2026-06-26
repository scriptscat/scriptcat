import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockIntersectionObserver } from "@Tests/mockIntersectionObserver";
import { mockMatchMedia } from "@Tests/mockMatchMedia";

const { get, set } = vi.hoisted(() => ({
  get: vi.fn((key: string) => {
    if (key === "cloud_sync")
      return Promise.resolve({ enable: false, syncDelete: false, syncStatus: true, filesystem: "webdav", params: {} });
    if (key === "cat_file_storage") return Promise.resolve({ status: "unset", filesystem: "webdav", params: {} });
    return Promise.resolve("scriptcat");
  }),
  set: vi.fn(),
}));
vi.mock("@App/pages/store/global", async () => {
  const { createGlobalStoreMock } = await import("@Tests/mocks/pageStores.ts");
  return createGlobalStoreMock({ systemConfig: { get, set } });
});
vi.mock("./sections/DeveloperMonacoEditor", () => ({
  DeveloperMonacoEditor: ({ ariaLabel }: { ariaLabel: string }) => <textarea aria-label={ariaLabel} />,
}));
import Setting from "./index";

beforeEach(() => {
  initTestLanguage("en-US");
  mockMatchMedia();
  mockIntersectionObserver();
});
afterEach(cleanup);

describe("设置页", () => {
  it("渲染 8 个分类导航项", async () => {
    render(<Setting />);
    await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(8));
  });
});
