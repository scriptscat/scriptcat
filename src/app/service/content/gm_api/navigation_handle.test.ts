import { describe, it, expect, vi, beforeEach } from "vitest";
import { UrlChangeEvent, attachNavigateHandler, resetAttachedForTest } from "./navigation_handle";

describe("UrlChangeEvent", () => {
  it.concurrent("应包含 url 属性", () => {
    const ev = new UrlChangeEvent("urlchange", "https://example.com/new");
    expect(ev.type).toBe("urlchange");
    expect(ev.url).toBe("https://example.com/new");
    expect(ev).toBeInstanceOf(Event);
  });
});

describe("attachNavigateHandler", () => {
  // 创建一个模拟的 window 对象，location.href 需要通过 getter 提供
  // 因为 getPropGetter 会遍历原型链查找 PropertyDescriptor
  const createMockWin = (href = "https://example.com/") => {
    const listeners: Record<string, EventListener[]> = {};
    const dispatched: Event[] = [];
    let currentHref = href;
    const location = Object.create(null);
    Object.defineProperty(location, "href", {
      get: () => currentHref,
      set: (v: string) => {
        currentHref = v;
      },
      configurable: true,
      enumerable: true,
    });
    return {
      win: {
        location,
        navigation: {
          addEventListener: vi.fn((type: string, handler: EventListener) => {
            (listeners[type] ||= []).push(handler);
          }),
        },
        dispatchEvent: vi.fn((ev: Event) => dispatched.push(ev)),
        addEventListener: vi.fn(),
      } as any,
      listeners,
      dispatched,
      // 模拟触发 navigate 事件
      fireNavigate(destUrl: string) {
        // 更新 location.href 模拟浏览器行为
        currentHref = destUrl;
        const ev = { type: "navigate", destination: { url: destUrl } } as any;
        for (const fn of listeners["navigate"] || []) {
          fn(ev);
        }
      },
    };
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    resetAttachedForTest();
  });

  it("不支持 Navigation API 时不应注册监听器", () => {
    const win = { location: { href: "https://example.com/" } } as any;
    attachNavigateHandler(win);
    // 没有 navigation 属性，不应报错也不应标记为 attached
    // 再次调用带 navigation 的 win 应该能正常注册
    const mock = createMockWin();
    attachNavigateHandler(mock.win);
    expect(mock.win.navigation.addEventListener).toHaveBeenCalledWith("navigate", expect.any(Function), false);
  });

  it("应在 win.navigation 上注册 navigate 监听器", () => {
    const mock = createMockWin();
    attachNavigateHandler(mock.win);
    expect(mock.win.navigation.addEventListener).toHaveBeenCalledTimes(1);
    expect(mock.win.navigation.addEventListener).toHaveBeenCalledWith("navigate", expect.any(Function), false);
  });

  it("多次调用只注册一次", () => {
    const mock = createMockWin();
    attachNavigateHandler(mock.win);
    attachNavigateHandler(mock.win);
    attachNavigateHandler(mock.win);
    expect(mock.win.navigation.addEventListener).toHaveBeenCalledTimes(1);
  });

  it("URL 变化时应派发 urlchange 事件", async () => {
    const mock = createMockWin("https://example.com/");
    attachNavigateHandler(mock.win);
    mock.fireNavigate("https://example.com/new");
    // handler 是 async，等待 microtask 完成
    await vi.waitFor(() => {
      expect(mock.dispatched.length).toBe(1);
    });
    const ev = mock.dispatched[0] as UrlChangeEvent;
    expect(ev.type).toBe("urlchange");
    expect(ev.url).toBe("https://example.com/new");
  });

  it("URL 未变化时不应派发事件", async () => {
    const mock = createMockWin("https://example.com/");
    attachNavigateHandler(mock.win);
    // destination.url 与当前 href 相同
    mock.fireNavigate("https://example.com/");
    await new Promise((r) => setTimeout(r, 50));
    expect(mock.dispatched.length).toBe(0);
  });
});
