import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";

vi.mock("@App/pages/components/use-is-mobile", () => ({ useIsMobile: vi.fn(() => false) }));

import AgentOPFS from "./index";

function fileHandle(name: string, content = "x"): any {
  return {
    kind: "file",
    name,
    async getFile() {
      return { size: content.length, lastModified: 0, text: async () => content };
    },
  };
}
function dirHandle(name: string, children: Record<string, any> = {}): any {
  return {
    kind: "directory",
    name,
    async *[Symbol.asyncIterator]() {
      for (const [n, h] of Object.entries(children)) yield [n, h];
    },
    async getDirectoryHandle(n: string) {
      return children[n];
    },
    async getFileHandle(n: string) {
      return children[n];
    },
    async removeEntry(n: string) {
      delete children[n];
    },
  };
}

let root: any;

beforeEach(() => {
  initLanguage("zh-CN");
  root = dirHandle("root", {
    "file1.txt": fileHandle("file1.txt", "hi"),
    subdir: dirHandle("subdir", { "inner.json": fileHandle("inner.json", "{}") }),
  });
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: { getDirectory: vi.fn(async () => root) },
  });
});
afterEach(() => cleanup());

describe("AgentOPFS 页面", () => {
  it("挂载后展示文件与目录", async () => {
    render(<AgentOPFS />);
    await waitFor(() => expect(screen.getByText("file1.txt")).toBeInTheDocument());
    expect(screen.getByText("subdir")).toBeInTheDocument();
  });

  it("点击目录进入并更新面包屑", async () => {
    render(<AgentOPFS />);
    await waitFor(() => expect(screen.getByTestId("entry-subdir")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("entry-subdir"));
    await waitFor(() => expect(screen.getByText("inner.json")).toBeInTheDocument());
    expect(screen.getByTestId("crumb-1")).toHaveTextContent("subdir");
  });
});
