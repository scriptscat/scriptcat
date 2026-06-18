// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const { connectVSCode } = vi.hoisted(() => ({ connectVSCode: vi.fn(() => Promise.resolve()) }));
vi.mock("@App/app/service/service_worker/client", () => ({
  SystemClient: class {
    connectVSCode = connectVSCode;
  },
}));

const { get, set } = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("@App/pages/store/global", () => ({ systemConfig: { get, set }, message: {} }));

import { DevToolsSection } from "./DevToolsSection";

afterEach(() => {
  cleanup();
  get.mockReset();
  set.mockReset();
  connectVSCode.mockClear();
});

describe("开发工具分区", () => {
  it("点击连接写入配置并连接 VSCode 服务", async () => {
    get.mockImplementation((key: string) => {
      if (key === "vscode_url") return Promise.resolve("ws://localhost:8642");
      if (key === "vscode_reconnect") return Promise.resolve(true);
      return Promise.resolve("");
    });
    render(<DevToolsSection register={() => () => {}} />);
    const input = (await screen.findByLabelText("vscode_url_input")) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("ws://localhost:8642"));
    fireEvent.click(screen.getByLabelText("vscode_connect"));
    expect(set).toHaveBeenCalledWith("vscode_url", "ws://localhost:8642");
    expect(set).toHaveBeenCalledWith("vscode_reconnect", true);
    await waitFor(() => expect(connectVSCode).toHaveBeenCalledWith({ url: "ws://localhost:8642", reconnect: true }));
  });
});
