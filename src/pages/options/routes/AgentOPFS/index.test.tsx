// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import { useIsMobile } from "@App/pages/components/use-is-mobile";

vi.mock("@App/pages/components/use-is-mobile", () => ({ useIsMobile: vi.fn(() => false) }));

import AgentOPFS from "./index";

const mockedUseIsMobile = vi.mocked(useIsMobile);

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
    async getFileHandle(n: string, opts?: { create?: boolean }) {
      if (!children[n] && opts?.create) {
        children[n] = { ...fileHandle(n, ""), createWritable: async () => writableFor(n, children) };
      }
      return children[n];
    },
    async removeEntry(n: string) {
      delete children[n];
    },
  };
}
// 写入句柄：close() 时把文件回填到目录，便于断言上传后文件出现
// 注:jsdom 的 File/Blob 没有可靠的 .text()，故只记录写入大小，不解析内容
function writableFor(name: string, children: Record<string, any>): any {
  let size = 0;
  return {
    async write(data: any) {
      size = typeof data === "string" ? data.length : (data?.size ?? 0);
    },
    async close() {
      children[name] = {
        kind: "file",
        name,
        async getFile() {
          return { size, lastModified: 0, text: async () => "" };
        },
      };
    },
  };
}

let root: any;

beforeEach(() => {
  initLanguage("zh-CN");
  mockedUseIsMobile.mockReturnValue(false);
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

  it("点击刷新重新读取当前目录", async () => {
    render(<AgentOPFS />);
    await waitFor(() => expect(screen.getByText("file1.txt")).toBeInTheDocument());
    // 挂载后往底层目录注入新文件:刷新前不应出现,刷新后应出现
    Object.defineProperty(root, Symbol.asyncIterator, {
      configurable: true,
      value: async function* () {
        yield ["file1.txt", fileHandle("file1.txt", "hi")];
        yield ["subdir", dirHandle("subdir")];
        yield ["added-after.txt", fileHandle("added-after.txt", "x")];
      },
    });
    expect(screen.queryByText("added-after.txt")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("opfs-refresh"));
    await waitFor(() => expect(screen.getByText("added-after.txt")).toBeInTheDocument());
  });

  it("选择文件后写入当前目录并刷新展示", async () => {
    render(<AgentOPFS />);
    await waitFor(() => expect(screen.getByText("file1.txt")).toBeInTheDocument());
    const input = screen.getByTestId("opfs-upload-input") as HTMLInputElement;
    const file = new File(["uploaded-content"], "report.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText("report.json")).toBeInTheDocument());
  });

  it("上传进行中:上传按钮禁用并显示忙碌指示器,完成后恢复(无静默操作)", async () => {
    // 用一个受控的 createWritable:close() 卡住直到我们手动放行,以稳定观察上传中状态
    let releaseClose!: () => void;
    const closeGate = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });
    root = dirHandle("root", { "file1.txt": fileHandle("file1.txt", "hi") });
    root.getFileHandle = async (n: string) => ({
      kind: "file",
      name: n,
      async createWritable() {
        return {
          async write() {},
          async close() {
            await closeGate;
          },
        };
      },
    });
    (navigator.storage.getDirectory as any).mockResolvedValue(root);

    render(<AgentOPFS />);
    await waitFor(() => expect(screen.getByText("file1.txt")).toBeInTheDocument());

    const upload = screen.getByTestId("opfs-upload");
    expect(upload).not.toBeDisabled();

    const input = screen.getByTestId("opfs-upload-input") as HTMLInputElement;
    const file = new File(["x"], "report.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });

    // 上传中:按钮禁用 + 出现忙碌进度指示(role=progressbar)
    await waitFor(() => expect(upload).toBeDisabled());
    expect(screen.getByTestId("opfs-upload-progress")).toBeInTheDocument();

    // 放行写入,上传结束后按钮恢复可用、进度指示消失
    releaseClose();
    await waitFor(() => expect(upload).not.toBeDisabled());
    expect(screen.queryByTestId("opfs-upload-progress")).not.toBeInTheDocument();
  });

  it("空目录展示空状态且描述区别于标题", async () => {
    root = dirHandle("root", {});
    (navigator.storage.getDirectory as any).mockResolvedValue(root);
    render(<AgentOPFS />);
    const empty = await screen.findByTestId("empty-state");
    // 描述不应与标题文案相同
    const title = empty.querySelector("p")?.textContent ?? "";
    const desc = empty.querySelectorAll("p")[1]?.textContent ?? "";
    expect(desc).not.toBe("");
    expect(desc).not.toBe(title);
  });

  it("移动端:页内工具行为图标按钮(无可见文案标签)+ 标题作为页内标题", async () => {
    mockedUseIsMobile.mockReturnValue(true);
    render(<AgentOPFS />);
    await waitFor(() => expect(screen.getByText("file1.txt")).toBeInTheDocument());
    const upload = screen.getByTestId("opfs-upload");
    const refresh = screen.getByTestId("opfs-refresh");
    // 图标按钮:有可访问名,但没有可见文本节点
    expect(upload).toHaveAccessibleName();
    expect(upload.textContent).toBe("");
    expect(refresh.textContent).toBe("");
    // 页内标题存在(以 test-id 断言,不耦合译文)
    expect(screen.getByTestId("opfs-mobile-title")).toBeInTheDocument();
  });

  it("移动端抑制 64px 桌面页头(避免与全局 MobileHeader 双层堆叠)", async () => {
    mockedUseIsMobile.mockReturnValue(true);
    render(<AgentOPFS />);
    await waitFor(() => expect(screen.getByText("file1.txt")).toBeInTheDocument());
    // AgentPageHeader 的副标题与带文案的桌面按钮均不应出现:说明 64px 页头未渲染
    expect(screen.queryByText("Origin Private File System · Agent 私有存储")).not.toBeInTheDocument();
    expect(screen.queryByTestId("opfs-refresh")?.textContent).not.toContain("刷新");
    expect(screen.queryByTestId("opfs-upload")?.textContent).not.toContain("上传");
  });

  it("桌面端渲染 64px 页头(含副标题与带文案的刷新/上传按钮)", async () => {
    mockedUseIsMobile.mockReturnValue(false);
    render(<AgentOPFS />);
    await waitFor(() => expect(screen.getByText("file1.txt")).toBeInTheDocument());
    expect(screen.getByText("Origin Private File System · Agent 私有存储")).toBeInTheDocument();
    expect(screen.getByTestId("opfs-refresh")).toHaveTextContent("刷新");
    expect(screen.getByTestId("opfs-upload")).toHaveTextContent("上传");
  });
});
