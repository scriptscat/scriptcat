// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import type { Script } from "@App/app/repo/scripts";
import { SCRIPT_STATUS_ENABLE, SCRIPT_TYPE_NORMAL } from "@App/app/repo/scripts";
import { saveScript, SAVE_CANCELED, type SaveDeps } from "./saveScript";

const mk = (over: Partial<Script> = {}): Script =>
  ({
    uuid: "u1",
    name: "脚本A",
    namespace: "ns",
    metadata: { name: ["脚本A"] },
    type: SCRIPT_TYPE_NORMAL,
    status: SCRIPT_STATUS_ENABLE,
    sort: 0,
    runStatus: "complete",
    createtime: 100,
    updatetime: 100,
    checktime: 0,
    ...over,
  }) as unknown as Script;

const baseDeps = (over: Partial<SaveDeps> = {}): SaveDeps => ({
  prepareScript: vi.fn(async () => ({ script: mk(), oldScript: mk() })),
  findByNameAndNamespace: vi.fn(async () => undefined),
  install: vi.fn(async () => ({ update: true, updatetime: 200 })),
  confirm: vi.fn(async () => true),
  now: () => 999,
  ...over,
});

describe("saveScript 保存逻辑", () => {
  it("正常保存应调用 install 并返回结果", async () => {
    const deps = baseDeps();
    const res = await saveScript(mk(), "code", deps);
    expect(deps.install).toHaveBeenCalledOnce();
    expect(res.updated).toBe(true);
    expect(res.updatetime).toBe(200);
  });

  it("新建脚本（createtime=0）应返回 updated=false", async () => {
    const deps = baseDeps({
      prepareScript: vi.fn(async () => ({ script: mk({ createtime: 0 }), oldScript: undefined })),
      install: vi.fn(async () => ({ update: false, updatetime: 200 })),
    });
    const res = await saveScript(mk({ createtime: 0 }), "code", deps);
    expect(res.updated).toBe(false);
  });

  it("重名冲突且用户取消时应抛 SAVE_CANCELED 且不 install", async () => {
    const deps = baseDeps({
      prepareScript: vi.fn(async () => ({ script: mk({ uuid: "u1" }), oldScript: undefined })),
      findByNameAndNamespace: vi.fn(async () => mk({ uuid: "other" })),
      confirm: vi.fn(async () => false),
    });
    await expect(saveScript(mk(), "code", deps)).rejects.toThrow(SAVE_CANCELED);
    expect(deps.install).not.toHaveBeenCalled();
  });

  it("重名冲突但用户确认时应继续 install", async () => {
    // 给已有脚本改名，新名与另一脚本冲突；oldScript 为正在编辑的脚本本身（旧名）
    const deps = baseDeps({
      prepareScript: vi.fn(async () => ({
        script: mk({ uuid: "u1", name: "新名" }),
        oldScript: mk({ uuid: "u1", name: "旧名" }),
      })),
      findByNameAndNamespace: vi.fn(async () => mk({ uuid: "other", name: "新名" })),
      confirm: vi.fn(async () => true),
    });
    await saveScript(mk(), "code", deps);
    expect(deps.install).toHaveBeenCalledOnce();
  });

  it("编辑冲突（updatetime 不一致）且用户取消时应抛 SAVE_CANCELED", async () => {
    const deps = baseDeps({
      // 编辑器内记录 updatetime=100，磁盘 oldScript.updatetime=300
      prepareScript: vi.fn(async () => ({
        script: mk({ uuid: "u1" }),
        oldScript: mk({ uuid: "u1", updatetime: 300 }),
      })),
      confirm: vi.fn(async () => false),
    });
    await expect(saveScript(mk({ updatetime: 100 }), "code", deps)).rejects.toThrow(SAVE_CANCELED);
    expect(deps.install).not.toHaveBeenCalled();
  });

  it("脚本名为空时应抛错且不 install", async () => {
    const deps = baseDeps({
      prepareScript: vi.fn(async () => ({ script: mk({ name: "" }), oldScript: mk() })),
    });
    await expect(saveScript(mk(), "code", deps)).rejects.toThrow();
    expect(deps.install).not.toHaveBeenCalled();
  });
});
