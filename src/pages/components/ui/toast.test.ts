import { describe, it, expect, vi, beforeEach } from "vitest";

const mockedToast = vi.hoisted(() => ({
  success: vi.fn(() => 1),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(() => 2),
  loading: vi.fn(() => 3),
  promise: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: mockedToast,
}));
vi.mock("i18next", () => ({ t: (k: string) => k }));

import { notify } from "./toast";

describe("notify 封装", () => {
  beforeEach(() => vi.clearAllMocks());

  it("success 应注入 3000ms 默认时长", () => {
    notify.success("done");
    expect(mockedToast.success).toHaveBeenCalledWith("done", expect.objectContaining({ duration: 3000 }));
  });

  it("error 应注入 4000ms 默认时长", () => {
    notify.error("fail");
    expect(mockedToast.error).toHaveBeenCalledWith("fail", expect.objectContaining({ duration: 4000 }));
  });

  it("loading 应使用 Infinity 时长", () => {
    notify.loading("loading");
    expect(mockedToast.loading).toHaveBeenCalledWith("loading", expect.objectContaining({ duration: Infinity }));
  });

  it("带 action 的 toast 应用 5000ms", () => {
    notify.success("x", { action: { label: "重试", onClick: () => {} } });
    expect(mockedToast.success).toHaveBeenCalledWith("x", expect.objectContaining({ duration: 5000 }));
  });

  it("opts.duration 应覆盖默认时长", () => {
    notify.success("x", { duration: 100 });
    expect(mockedToast.success).toHaveBeenCalledWith("x", expect.objectContaining({ duration: 100 }));
  });

  it("description/id 应透传", () => {
    notify.error("e", { description: "d", id: "k" });
    expect(mockedToast.error).toHaveBeenCalledWith("e", expect.objectContaining({ description: "d", id: "k" }));
  });

  it("dismiss 与 promise 应透传", () => {
    notify.dismiss("k");
    expect(mockedToast.dismiss).toHaveBeenCalledWith("k");
    const p = Promise.resolve(1);
    notify.promise(p, { loading: "l", success: "s", error: "e" });
    expect(mockedToast.promise).toHaveBeenCalledWith(p, expect.objectContaining({ loading: "l" }));
  });

  describe("自动关闭进度条时长变量", () => {
    it("success 应注入 --sc-toast-duration=3000ms", () => {
      notify.success("done");
      expect(mockedToast.success).toHaveBeenCalledWith(
        "done",
        expect.objectContaining({ style: expect.objectContaining({ "--sc-toast-duration": "3000ms" }) })
      );
    });

    it("error 应注入 --sc-toast-duration=4000ms", () => {
      notify.error("fail");
      expect(mockedToast.error).toHaveBeenCalledWith(
        "fail",
        expect.objectContaining({ style: expect.objectContaining({ "--sc-toast-duration": "4000ms" }) })
      );
    });

    it("带 action 的 toast 进度条时长应为 5000ms", () => {
      notify.success("x", { action: { label: "重试", onClick: () => {} } });
      expect(mockedToast.success).toHaveBeenCalledWith(
        "x",
        expect.objectContaining({ style: expect.objectContaining({ "--sc-toast-duration": "5000ms" }) })
      );
    });

    it("opts.duration 应同步到进度条时长变量", () => {
      notify.success("x", { duration: 100 });
      expect(mockedToast.success).toHaveBeenCalledWith(
        "x",
        expect.objectContaining({ style: expect.objectContaining({ "--sc-toast-duration": "100ms" }) })
      );
    });

    it("loading 不应注入进度条时长变量（Infinity 不自动关闭）", () => {
      notify.loading("loading");
      const call = mockedToast.loading.mock.calls.at(-1) as unknown as [string, { style?: Record<string, string> }?];
      expect(call[1]?.style?.["--sc-toast-duration"]).toBeUndefined();
    });
  });
});
