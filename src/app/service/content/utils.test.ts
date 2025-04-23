import { describe, expect, it } from "vitest";
import { init, proxyContext, writables } from "./utils";

describe("proxy context", () => {
  const context: any = {};
  const global: any = {
    gbok: "gbok",
    onload: null,
    eval: () => {
      console.log("eval");
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    location: "ok",
  };
  init.set("onload", true);
  init.set("location", true);
  const _this = proxyContext(global, context);

  it("set contenxt", () => {
    _this["md5"] = "ok";
    expect(_this["md5"]).toEqual("ok");
    expect(global["md5"]).toEqual(undefined);
  });

  it("set window null", () => {
    _this["onload"] = "ok";
    expect(_this["onload"]).toEqual("ok");
    expect(global["onload"]).toEqual(null);
    _this["onload"] = undefined;
    expect(_this["onload"]).toEqual(undefined);
  });

  it("update", () => {
    _this["okk"] = "ok";
    expect(_this["okk"]).toEqual("ok");
    expect(global["okk"]).toEqual(undefined);
    _this["okk"] = "ok2";
    expect(_this["okk"]).toEqual("ok2");
    expect(global["okk"]).toEqual(undefined);
  });

  it("禁止穿透global对象", () => {
    expect(_this["gbok"]).toBeUndefined();
  });

  it("禁止修改window", () => {
    expect(() => (_this["window"] = "ok")).toThrow();
  });

  it("访问location", () => {
    expect(_this.location).not.toBeUndefined();
  });
});

// 只允许访问onxxxxx
describe("window", () => {
  const _this = proxyContext({ onanimationstart: null }, {});
  it("window", () => {
    expect(_this.onanimationstart).toBeNull();
  });
});

describe("兼容问题", () => {
  const _this = proxyContext({}, {});
  // https://github.com/xcanwin/KeepChatGPT 环境隔离得不够干净导致的
  it("Uncaught TypeError: Illegal invocation #189", () => {
    return new Promise((resolve) => {
      console.log(_this.setTimeout.prototype);
      _this.setTimeout(resolve, 100);
    });
  });
  // AC-baidu-重定向优化百度搜狗谷歌必应搜索_favicon_双列
  it("TypeError: Object.freeze is not a function #116", () => {
    expect(() => _this.Object.freeze({})).not.toThrow();
  });
});

describe("Symbol", () => {
  const _this = proxyContext({}, {});
  // 允许往global写入Symbol属性,影响内容: https://bbs.tampermonkey.net.cn/thread-5509-1-1.html
  it("Symbol", () => {
    const s = Symbol("test");
    _this[s] = "ok";
    expect(_this[s]).toEqual("ok");
  });
  // toString.call(window)返回的是'[object Object]'而不是'[object Window]',影响内容: https://github.com/scriptscat/scriptcat/issues/260
  it("Window", () => {
    expect(toString.call(_this)).toEqual("[object Window]");
  });
});

// Object.hasOwnProperty穿透 https://github.com/scriptscat/scriptcat/issues/272
describe("Object", () => {
  const _this = proxyContext({}, {});
  it("hasOwnProperty", () => {
    expect(_this.hasOwnProperty("test1")).toEqual(false);
    _this.test1 = "ok";
    expect(_this.hasOwnProperty("test1")).toEqual(true);
    expect(_this.hasOwnProperty("test")).toEqual(true);
  });
});
