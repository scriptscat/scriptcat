import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { useIsMobile } from "@App/pages/components/use-is-mobile";

vi.mock("@App/pages/components/use-is-mobile", () => ({ useIsMobile: vi.fn(() => false) }));
const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("@App/pages/components/ui/toast", () => ({ notify }));

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
      if (!children[n]) throw new DOMException("Not found", "NotFoundError");
      return children[n];
    },
    async getFileHandle(n: string, opts?: { create?: boolean }) {
      if (!children[n]) {
        if (!opts?.create) throw new DOMException("Not found", "NotFoundError");
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
// 注:测试环境的 File/Blob 没有可靠的 .text()，故只记录写入大小，不解析内容
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

// agents/workspace 是唯一可修改目录，涉及写操作的用例都要先进到这里
function useWorkspace(children: Record<string, any> = {}) {
  const workspace = dirHandle("workspace", children);
  root = dirHandle("root", { agents: dirHandle("agents", { workspace }) });
  (navigator.storage.getDirectory as any).mockResolvedValue(root);
  return workspace;
}

async function enterWorkspace() {
  fireEvent.click(await screen.findByTestId("entry-agents"));
  fireEvent.click(await screen.findByTestId("entry-workspace"));
}

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
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
afterEach(() => {
  cleanup();
  notify.success.mockClear();
  notify.error.mockClear();
});

describe("AgentOPFS 页面", () => {
  it("挂载后展示文件与目录", async () => {
    render(<AgentOPFS />);
    expect(await screen.findByText("file1.txt")).toBeInTheDocument();
    expect(screen.getByText("subdir")).toBeInTheDocument();
  });

  it("系统目录浏览时只提供读取和下载，不提供修改操作", async () => {
    render(<AgentOPFS />);
    expect(await screen.findByText("file1.txt")).toBeInTheDocument();
    expect(screen.queryByTestId("opfs-upload")).not.toBeInTheDocument();
    expect(screen.queryByTestId("delete-file1.txt")).not.toBeInTheDocument();
    expect(screen.getByTestId("opfs-read-only-notice")).toBeInTheDocument();
  });

  it("点击目录进入并更新面包屑", async () => {
    render(<AgentOPFS />);
    expect(await screen.findByTestId("entry-subdir")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("entry-subdir"));
    expect(await screen.findByText("inner.json")).toBeInTheDocument();
    expect(screen.getByTestId("crumb-1")).toHaveTextContent("subdir");
  });

  it("点击刷新重新读取当前目录", async () => {
    render(<AgentOPFS />);
    expect(await screen.findByText("file1.txt")).toBeInTheDocument();
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
    expect(await screen.findByText("added-after.txt")).toBeInTheDocument();
  });

  it("选择文件后写入当前目录并刷新展示", async () => {
    const workspace = dirHandle("workspace");
    root = dirHandle("root", { agents: dirHandle("agents", { workspace }) });
    (navigator.storage.getDirectory as any).mockResolvedValue(root);
    render(<AgentOPFS />);
    fireEvent.click(await screen.findByTestId("entry-agents"));
    fireEvent.click(await screen.findByTestId("entry-workspace"));
    const input = screen.getByTestId("opfs-upload-input") as HTMLInputElement;
    const file = new File(["uploaded-content"], "report.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText("report.json")).toBeInTheDocument();
  });

  it("上传进行中:上传按钮禁用并显示忙碌指示器,完成后恢复(无静默操作)", async () => {
    // 用一个受控的 createWritable:close() 卡住直到我们手动放行,以稳定观察上传中状态
    let releaseClose!: () => void;
    const closeGate = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });
    const workspace = dirHandle("workspace", { "file1.txt": fileHandle("file1.txt", "hi") });
    workspace.getFileHandle = async (n: string) => ({
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
    root = dirHandle("root", { agents: dirHandle("agents", { workspace }) });
    (navigator.storage.getDirectory as any).mockResolvedValue(root);

    render(<AgentOPFS />);
    fireEvent.click(await screen.findByTestId("entry-agents"));
    fireEvent.click(await screen.findByTestId("entry-workspace"));
    expect(await screen.findByText("file1.txt")).toBeInTheDocument();

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

  it("加载失败显示错误并可重试,不应伪装成空目录", async () => {
    const getDirectory = vi.fn().mockRejectedValueOnce(new Error("permission denied")).mockResolvedValueOnce(root);
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { getDirectory },
    });
    render(<AgentOPFS />);
    expect(await screen.findByTestId("opfs-load-error")).toHaveTextContent("permission denied");
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("opfs-load-retry"));
    expect(await screen.findByText("file1.txt")).toBeInTheDocument();
  });

  it("重命名进行中禁用重复提交并显示忙碌状态", async () => {
    let releaseLookup!: () => void;
    const lookupGate = new Promise<void>((resolve) => {
      releaseLookup = resolve;
    });
    const oldFile = fileHandle("old.txt", "data");
    oldFile.createWritable = async () => writableFor("new.txt", {});
    const workspace = dirHandle("workspace", { "old.txt": oldFile });
    const originalGetFileHandle = workspace.getFileHandle;
    const originalGetDirectoryHandle = workspace.getDirectoryHandle;
    workspace.getFileHandle = async (name: string, opts?: { create?: boolean }) => {
      if (name === "new.txt" && !opts?.create) {
        await lookupGate;
        throw new DOMException("Not found", "NotFoundError");
      }
      return originalGetFileHandle(name, opts);
    };
    workspace.getDirectoryHandle = async (name: string) => {
      if (name === "new.txt") throw new DOMException("Not found", "NotFoundError");
      return originalGetDirectoryHandle(name);
    };
    root = dirHandle("root", { agents: dirHandle("agents", { workspace }) });
    (navigator.storage.getDirectory as any).mockResolvedValue(root);

    render(<AgentOPFS />);
    fireEvent.click(await screen.findByTestId("entry-agents"));
    fireEvent.click(await screen.findByTestId("entry-workspace"));
    fireEvent.click(await screen.findByTestId("rename-old.txt"));
    fireEvent.change(await screen.findByTestId("opfs-entry-edit-input"), { target: { value: "new.txt" } });
    const submit = screen.getByTestId("opfs-entry-edit-submit");
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent("加载中...");

    releaseLookup();
    await waitFor(() => expect(screen.queryByTestId("opfs-entry-edit-input")).not.toBeInTheDocument());
  });

  it("workspace 内桌面端上传按钮带文案", async () => {
    useWorkspace({ "file1.txt": fileHandle("file1.txt", "hi") });
    render(<AgentOPFS />);
    await enterWorkspace();
    expect(await screen.findByText("file1.txt")).toBeInTheDocument();
    expect(screen.getByTestId("opfs-upload")).toHaveTextContent("上传");
  });

  it("workspace 内移动端上传按钮为图标按钮(有可访问名,无可见文案)", async () => {
    mockedUseIsMobile.mockReturnValue(true);
    useWorkspace({ "file1.txt": fileHandle("file1.txt", "hi") });
    render(<AgentOPFS />);
    await enterWorkspace();
    const upload = await screen.findByTestId("opfs-upload");
    expect(upload).toHaveAccessibleName();
    expect(upload.textContent).toBe("");
  });

  it("重命名未修改名称时直接关闭且不提示成功", async () => {
    useWorkspace({ "old.txt": fileHandle("old.txt", "data") });
    render(<AgentOPFS />);
    await enterWorkspace();
    fireEvent.click(await screen.findByTestId("rename-old.txt"));
    fireEvent.click(screen.getByTestId("opfs-entry-edit-submit"));
    await waitFor(() => expect(screen.queryByTestId("opfs-entry-edit-input")).not.toBeInTheDocument());
    expect(notify.success).not.toHaveBeenCalled();
  });

  it("移动对话框用目录选择器给出 workspace 下的可选目标", async () => {
    useWorkspace({ "old.txt": fileHandle("old.txt", "data"), target: dirHandle("target") });
    render(<AgentOPFS />);
    await enterWorkspace();
    fireEvent.click(await screen.findByTestId("move-old.txt"));
    const destination = await screen.findByTestId("opfs-move-destination");
    expect(destination).toHaveTextContent("agents/workspace/target");
    fireEvent.click(screen.getByTestId("opfs-entry-edit-submit"));
    await waitFor(() => expect(screen.queryByText("old.txt")).not.toBeInTheDocument());
    expect(notify.success).toHaveBeenCalled();
  });

  it("workspace 下没有其他目录时移动给出提示而不是打开空选择器", async () => {
    useWorkspace({ "old.txt": fileHandle("old.txt", "data") });
    render(<AgentOPFS />);
    await enterWorkspace();
    fireEvent.click(await screen.findByTestId("move-old.txt"));
    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    expect(screen.queryByTestId("opfs-move-destination")).not.toBeInTheDocument();
  });

  it("刷新时保留已加载列表,不整块换成加载态", async () => {
    let releaseSecondList!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseSecondList = resolve;
    });
    let listCount = 0;
    const children = { "file1.txt": fileHandle("file1.txt", "hi") };
    root = {
      kind: "directory",
      name: "root",
      async *[Symbol.asyncIterator]() {
        listCount += 1;
        if (listCount === 2) await gate;
        for (const [n, h] of Object.entries(children)) yield [n, h];
      },
    };
    (navigator.storage.getDirectory as any).mockResolvedValue(root);

    render(<AgentOPFS />);
    expect(await screen.findByText("file1.txt")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("opfs-refresh"));
    expect(screen.queryByTestId("opfs-loading")).not.toBeInTheDocument();
    expect(screen.getByText("file1.txt")).toBeInTheDocument();
    releaseSecondList();
    await waitFor(() => expect(screen.getByText("file1.txt")).toBeInTheDocument());
  });

  it("移动端:页内工具行为图标按钮(无可见文案标签)+ 标题作为页内标题", async () => {
    mockedUseIsMobile.mockReturnValue(true);
    render(<AgentOPFS />);
    expect(await screen.findByText("file1.txt")).toBeInTheDocument();
    const refresh = screen.getByTestId("opfs-refresh");
    expect(refresh.textContent).toBe("");
    expect(screen.queryByTestId("opfs-upload")).not.toBeInTheDocument();
    // 页内标题存在(以 test-id 断言,不耦合译文)
    expect(screen.getByTestId("opfs-mobile-title")).toBeInTheDocument();
  });

  it("移动端只读目录没有可用操作时不显示空菜单", async () => {
    mockedUseIsMobile.mockReturnValue(true);
    root = dirHandle("root", { subdir: dirHandle("subdir") });
    (navigator.storage.getDirectory as any).mockResolvedValue(root);
    render(<AgentOPFS />);
    expect(await screen.findByTestId("entry-subdir")).toBeInTheDocument();
    expect(screen.queryByTestId("card-menu")).not.toBeInTheDocument();
  });

  it("移动端抑制 64px 桌面页头(避免与全局 MobileHeader 双层堆叠)", async () => {
    mockedUseIsMobile.mockReturnValue(true);
    render(<AgentOPFS />);
    expect(await screen.findByText("file1.txt")).toBeInTheDocument();
    // AgentPageHeader 的副标题与带文案的桌面按钮均不应出现:说明 64px 页头未渲染
    expect(screen.queryByText("Origin Private File System · Agent 私有存储")).not.toBeInTheDocument();
    expect(screen.queryByTestId("opfs-refresh")?.textContent).not.toContain("刷新");
    expect(screen.queryByTestId("opfs-upload")).not.toBeInTheDocument();
  });

  it("桌面端渲染 64px 页头并在系统目录隐藏上传按钮", async () => {
    mockedUseIsMobile.mockReturnValue(false);
    render(<AgentOPFS />);
    expect(await screen.findByText("file1.txt")).toBeInTheDocument();
    expect(screen.getByText("Origin Private File System · Agent 私有存储")).toBeInTheDocument();
    expect(screen.getByTestId("opfs-refresh")).toHaveTextContent("刷新");
    expect(screen.queryByTestId("opfs-upload")).not.toBeInTheDocument();
  });
});
