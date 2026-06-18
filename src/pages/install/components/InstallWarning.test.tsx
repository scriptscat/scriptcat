import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { initLanguage } from "@App/locales/locales";
import { InstallWarning } from "./InstallWarning";

afterEach(cleanup);

describe("InstallWarning 安全警示条", () => {
  it("渲染警示标题与说明两段(对照设计稿)", () => {
    initLanguage("zh-CN");
    render(<InstallWarning hasDangerPermission={false} hasAntifeature={false} />);
    expect(screen.getByTestId("install-warning-title")).toBeInTheDocument();
    expect(screen.getByTestId("install-warning-desc")).toBeInTheDocument();
  });

  it("存在危险权限时附加风险提示分句", () => {
    initLanguage("zh-CN");
    render(<InstallWarning hasDangerPermission hasAntifeature={false} />);
    expect(screen.getByTestId("install-warning-risk")).toBeInTheDocument();
  });

  it("无风险信号时不渲染风险提示分句", () => {
    initLanguage("zh-CN");
    render(<InstallWarning hasDangerPermission={false} hasAntifeature={false} />);
    expect(screen.queryByTestId("install-warning-risk")).not.toBeInTheDocument();
  });
});
