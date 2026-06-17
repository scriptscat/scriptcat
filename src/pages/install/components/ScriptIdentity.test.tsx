import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import { ScriptIdentity } from "./ScriptIdentity";

const base = {
  name: "全网每日签到助手",
  source: "example.com",
  author: "scriptcat",
  description: "一个示例脚本",
  antifeatures: [] as never[],
  schedule: null,
  enabled: true,
  onEnabledChange: () => {},
};

afterEach(cleanup);

describe("ScriptIdentity 身份卡", () => {
  it("渲染名称、作者、来源与描述", () => {
    initLanguage("zh-CN");
    render(<ScriptIdentity {...base} version={{ kind: "install", version: "2.3.1" }} />);
    expect(screen.getByText("全网每日签到助手")).toBeInTheDocument();
    expect(screen.getByText("scriptcat")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("一个示例脚本")).toBeInTheDocument();
  });

  it("全新安装显示单枚版本徽章", () => {
    initLanguage("zh-CN");
    render(<ScriptIdentity {...base} version={{ kind: "install", version: "2.3.1" }} />);
    expect(screen.getByTestId("version-single")).toHaveTextContent("2.3.1");
    expect(screen.queryByTestId("version-old")).not.toBeInTheDocument();
  });

  it("更新显示 旧→新 版本徽章", () => {
    initLanguage("zh-CN");
    render(
      <ScriptIdentity {...base} version={{ kind: "update", oldVersion: "2.1.0", newVersion: "2.3.1", changed: true }} />
    );
    expect(screen.getByTestId("version-old")).toHaveTextContent("2.1.0");
    expect(screen.getByTestId("version-new")).toHaveTextContent("2.3.1");
  });

  it("反特性渲染为警示徽章", () => {
    initLanguage("zh-CN");
    render(
      <ScriptIdentity {...base} antifeatures={["referral-link"]} version={{ kind: "install", version: "1.0.0" }} />
    );
    expect(screen.getByText("推荐链接")).toBeInTheDocument();
  });

  it("定时脚本显示 cron 信息条与下次运行", () => {
    initLanguage("zh-CN");
    render(
      <ScriptIdentity
        {...base}
        schedule={{ kind: "cron", expression: "0 8 * * *" }}
        scheduleNextRun="明天 08:00"
        version={{ kind: "install", version: "1.0.0" }}
      />
    );
    expect(screen.getByText("0 8 * * *")).toBeInTheDocument();
    expect(screen.getByText("明天 08:00")).toBeInTheDocument();
    expect(screen.getByText("定时")).toBeInTheDocument();
  });

  it("后台脚本显示后台运行说明与后台徽章", () => {
    initLanguage("zh-CN");
    render(
      <ScriptIdentity {...base} schedule={{ kind: "background" }} version={{ kind: "install", version: "1.0.0" }} />
    );
    expect(screen.getByText("浏览器开启时自动运行")).toBeInTheDocument();
    expect(screen.getByText("后台")).toBeInTheDocument();
  });

  it("切换启用开关触发回调", () => {
    initLanguage("zh-CN");
    const onEnabledChange = vi.fn();
    render(
      <ScriptIdentity
        {...base}
        enabled={true}
        onEnabledChange={onEnabledChange}
        version={{ kind: "install", version: "1.0.0" }}
      />
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onEnabledChange).toHaveBeenCalledWith(false);
  });
});
