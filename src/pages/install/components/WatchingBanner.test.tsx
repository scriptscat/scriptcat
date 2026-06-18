// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { initTestLanguage } from "@Tests/initTestLanguage";
import { WatchingBanner } from "./WatchingBanner";

beforeAll(() => initTestLanguage("zh-CN"));

afterEach(cleanup);

describe("WatchingBanner 文件监听横幅", () => {
  it("渲染监听横幅容器", () => {
    render(<WatchingBanner fileName="checkin.user.js" />);
    expect(screen.getByTestId("watching-banner")).toBeInTheDocument();
  });

  it("提供最后同步时间时渲染时间戳区", () => {
    render(<WatchingBanner fileName="a.user.js" lastSync="12:34:56" />);
    expect(screen.getByTestId("watching-last-sync")).toBeInTheDocument();
  });

  it("未提供最后同步时间时不渲染时间戳区", () => {
    render(<WatchingBanner fileName="a.user.js" />);
    expect(screen.queryByTestId("watching-last-sync")).not.toBeInTheDocument();
  });
});
