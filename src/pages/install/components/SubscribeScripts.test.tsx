// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import { SubscribeScripts } from "./SubscribeScripts";

afterEach(cleanup);

describe("SubscribeScripts 订阅脚本列表卡", () => {
  it("渲染标题与每个脚本 URL", () => {
    initLanguage("zh-CN");
    render(<SubscribeScripts scriptUrls={["https://s.cat/1.user.js", "https://s.cat/2.user.js"]} />);
    expect(screen.getByText("本订阅将安装以下脚本")).toBeInTheDocument();
    expect(screen.getByText("https://s.cat/1.user.js")).toBeInTheDocument();
    expect(screen.getByText("https://s.cat/2.user.js")).toBeInTheDocument();
  });

  it("无脚本时显示空态文案", () => {
    initLanguage("zh-CN");
    render(<SubscribeScripts scriptUrls={[]} />);
    expect(screen.getByText("该订阅暂未声明脚本")).toBeInTheDocument();
  });
});
