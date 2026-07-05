import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { initTestLanguage } from "@Tests/initTestLanguage";

const { findByScriptID } = vi.hoisted(() => ({ findByScriptID: vi.fn() }));
vi.mock("@App/app/repo/export", () => ({
  ExportDAO: class {
    findByScriptID = findByScriptID;
    save = vi.fn();
  },
}));

import CloudScriptPlan, { cloudDefaultParams, invalidateCloudScriptPlan, preloadCloudScriptPlan } from "./index";

beforeAll(() => initTestLanguage("zh-CN"));

beforeEach(() => {
  findByScriptID.mockReset();
  findByScriptID.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  invalidateCloudScriptPlan();
});

describe("云端导出默认参数 cloudDefaultParams", () => {
  it("从 metadata 读取 exportvalue / exportcookie", () => {
    expect(cloudDefaultParams({ metadata: { exportvalue: ["return v"], exportcookie: ["return c"] } } as any)).toEqual({
      exportValue: "return v",
      exportCookie: "return c",
    });
  });

  it("metadata 缺失时回退为空串", () => {
    expect(cloudDefaultParams({ metadata: {} } as any)).toEqual({ exportValue: "", exportCookie: "" });
  });
});

describe("云端导出计划预加载", () => {
  it("预加载后打开弹窗应复用同一份导出计划", async () => {
    const script = { uuid: "u1", name: "脚本A", metadata: {} } as any;
    await preloadCloudScriptPlan(script);

    render(<CloudScriptPlan script={script} open onOpenChange={vi.fn()} />);

    expect(screen.getByText("脚本A")).toBeInTheDocument();
    expect(findByScriptID).toHaveBeenCalledOnce();
  });

  it("读取导出计划失败时仍应以脚本默认值打开弹窗", async () => {
    findByScriptID.mockRejectedValue(new Error("boom"));
    const script = { uuid: "u1", name: "脚本A", metadata: {} } as any;

    render(<CloudScriptPlan script={script} open onOpenChange={vi.fn()} />);

    expect(await screen.findByText("脚本A")).toBeInTheDocument();
  });
});
