import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, type Mock } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { mockMatchMedia } from "@Tests/mockMatchMedia";

vi.mock("./useInstallData", () => ({ useInstallData: vi.fn() }));
// Monaco 编辑器无法在 DOM 测试环境中渲染(需 worker + ThemeProvider),用桩替换
vi.mock("@App/pages/components/CodeEditor", () => import("@Tests/mocks/CodeEditor.tsx"));

import { useInstallData, type InstallView } from "./useInstallData";
import App from "./App";

const mockHook = useInstallData as Mock;

const baseHook = () => ({
  enabled: true,
  setEnabled: vi.fn(),
  localFile: false,
  watching: false,
  toggleWatch: vi.fn(),
  install: vi.fn(),
  close: vi.fn(),
  installSkill: vi.fn(),
  cancelSkill: vi.fn(),
  retry: vi.fn(),
});

const readyView = (over: Partial<InstallView> = {}): InstallView => ({
  isUpdate: false,
  isSubscribe: false,
  name: "全网每日签到助手",
  author: "scriptcat",
  source: "example.com",
  description: "示例",
  version: { kind: "install", version: "2.3.1" },
  permissions: [{ kind: "match", risk: "normal", values: ["https://e.com/*"], sensitive: [] }],
  antifeatures: [],
  schedule: null,
  code: "// a\n// b",
  subscribeScripts: [],
  ...over,
});

beforeEach(() => {
  mockMatchMedia();
});

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(cleanup);

describe("Install App 状态分流", () => {
  it("loading 状态渲染加载屏", () => {
    mockHook.mockReturnValue({ ...baseHook(), state: { status: "loading" } });
    render(<App />);
    expect(screen.getByText("正在加载脚本")).toBeInTheDocument();
  });

  it("invalid 状态渲染无效页面", () => {
    mockHook.mockReturnValue({ ...baseHook(), state: { status: "invalid" } });
    render(<App />);
    expect(screen.getByText("无效页面")).toBeInTheDocument();
  });

  it("error 状态渲染失败屏与错误信息", () => {
    mockHook.mockReturnValue({ ...baseHook(), state: { status: "error", message: "boom-404" } });
    render(<App />);
    expect(screen.getByText("boom-404")).toBeInTheDocument();
  });

  it("error 状态提供重试按钮,点击调用 retry", () => {
    const retry = vi.fn();
    mockHook.mockReturnValue({ ...baseHook(), retry, state: { status: "error", message: "boom" } });
    render(<App />);
    fireEvent.click(screen.getByText("重试"));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("invalid 状态不提供重试按钮", () => {
    mockHook.mockReturnValue({ ...baseHook(), state: { status: "invalid" } });
    render(<App />);
    expect(screen.queryByText("重试")).not.toBeInTheDocument();
  });

  it("ready 状态渲染身份卡、权限卡、代码卡与安装按钮", () => {
    mockHook.mockReturnValue({ ...baseHook(), state: { status: "ready", view: readyView() } });
    render(<App />);
    expect(screen.getByText("全网每日签到助手")).toBeInTheDocument();
    expect(screen.getByText("此脚本将获得以下权限")).toBeInTheDocument();
    expect(screen.getByText("2 行")).toBeInTheDocument();
    expect(screen.getByTestId("install-primary")).toHaveTextContent("安装");
  });

  it("ready 更新态顶部上下文标题为脚本更新", () => {
    mockHook.mockReturnValue({
      ...baseHook(),
      state: {
        status: "ready",
        view: readyView({
          isUpdate: true,
          version: { kind: "update", oldVersion: "1.0.0", newVersion: "2.0.0", changed: true },
        }),
      },
    });
    render(<App />);
    expect(screen.getByText("脚本更新")).toBeInTheDocument();
  });

  it("skill 状态渲染技能安装视图", () => {
    mockHook.mockReturnValue({
      ...baseHook(),
      state: {
        status: "skill",
        skill: {
          skillMd: "# s",
          metadata: { name: "我的技能" },
          prompt: "提示词",
          scripts: [],
          references: [],
          isUpdate: false,
        },
      },
    });
    render(<App />);
    expect(screen.getByText("我的技能")).toBeInTheDocument();
    expect(screen.getByTestId("skill-install")).toBeInTheDocument();
  });

  it("订阅安装时渲染脚本列表卡而非权限卡", () => {
    mockHook.mockReturnValue({
      ...baseHook(),
      state: {
        status: "ready",
        view: readyView({ isSubscribe: true, subscribeScripts: ["https://s.cat/1.user.js"] }),
      },
    });
    render(<App />);
    expect(screen.getByText("本订阅将安装以下脚本")).toBeInTheDocument();
    expect(screen.getByText("https://s.cat/1.user.js")).toBeInTheDocument();
    expect(screen.queryByText("此脚本将获得以下权限")).not.toBeInTheDocument();
  });

  it("本地文件安装时显示监听文件按钮", () => {
    mockHook.mockReturnValue({
      ...baseHook(),
      localFile: true,
      state: { status: "ready", view: readyView() },
    });
    render(<App />);
    expect(screen.getByTestId("watch-toggle")).toBeInTheDocument();
  });

  it("监听中显示监听横幅且安装按钮禁用", () => {
    mockHook.mockReturnValue({
      ...baseHook(),
      localFile: true,
      watching: true,
      watchFileName: "checkin.user.js",
      state: { status: "ready", view: readyView() },
    });
    render(<App />);
    expect(screen.getByTestId("watching-banner")).toBeInTheDocument();
    expect(screen.getByTestId("install-primary")).toBeDisabled();
  });
});
