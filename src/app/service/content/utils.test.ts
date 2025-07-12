import { describe, expect, it } from "vitest";
import { initCopy, createProxyContext } from "./utils";

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
  initCopy.onload = null;
  initCopy.location = "ok";
  const _this = createProxyContext(global, context);

  it("set contenxt", () => {
    _this["md5"] = "ok";
    expect(_this["md5"]).toEqual("ok");
    expect(global["md5"]).toEqual(undefined);
  });

  it("set window.onload null", () => {
    // null確認
    _this["onload"] = null;
    global["onload"] = null;
    expect(_this["onload"]).toBeNull();
    expect(global["onload"]).toBeNull();
    // _this.onload
    _this["onload"] = function thisOnLoad() { };
    expect(_this["onload"]?.name).toEqual("thisOnLoad");
    expect(global["onload"]).toBeNull();
    _this["onload"] = null;
    global["onload"] = function globalOnLoad() { };
    expect(_this["onload"]).toBeNull();
    expect(global["onload"]?.name).toEqual("globalOnLoad");
    global["onload"] = null;
    // 還原確認
    expect(_this["onload"]).toBeNull();
    expect(global["onload"]).toBeNull();
  });

  it("update", () => {
    _this["okk"] = "ok";
    expect(_this["okk"]).toEqual("ok");
    expect(global["okk"]).toEqual(undefined);
    _this["okk"] = "ok2";
    expect(_this["okk"]).toEqual("ok2");
    expect(global["okk"]).toEqual(undefined);
  });

  // https://github.com/scriptscat/scriptcat/issues/273
  it("禁止穿透global对象", () => {
    expect(_this["gbok"]).toBeUndefined();
  });

  it("禁止修改window", () => {
    // expect(() => (_this["window"] = "ok")).toThrow();
    expect(() => {
      const before = _this["window"];
      _this["window"] = "ok";
      if (before !== _this["window"]) throw new Error('err');
    }).toThrow();
  });

  it("访问location", () => {
    expect(_this.location).not.toBeUndefined();
  });
});

// 只允许访问onxxxxx
describe("window", () => {
  const _this = createProxyContext<{ [key: string]: any} & any>({ onanimationstart: null }, {});
  it("onxxxxx", () => {
    expect(_this.onanimationstart).toBeNull();
  });
});

describe("兼容问题", () => {
  const _this = createProxyContext<{ [key: string]: any} & any>({}, {});
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
  const tag = (<any>global)[Symbol.toStringTag]; // 实际环境：'[object Window]' 测试环境：'[object global]'
  const _this = createProxyContext<{ [key: string]: any } & any>({}, {});
  // 允许往global写入Symbol属性,影响内容: https://bbs.tampermonkey.net.cn/thread-5509-1-1.html
  it("Symbol", () => {
    const s = Symbol("test");
    _this[s] = "ok";
    expect(_this[s]).toEqual("ok");
  });
  // toString.call(window)返回的是'[object Object]',影响内容: https://github.com/scriptscat/scriptcat/issues/260
  it("Window", () => {
    expect(toString.call(_this)).toEqual(`[object ${tag}]`); // 与 global 一致
    expect(toString.call(_this)).not.toEqual("[object Object]"); // 不是 [object Object]
  });
});

// Object.hasOwnProperty穿透 https://github.com/scriptscat/scriptcat/issues/272
describe("Object", () => {
  const _this = createProxyContext<{ [key: string]: any} & any>({}, {});
  it("hasOwnProperty", () => {
    expect(Object.prototype.hasOwnProperty.call(_this, "test1")).toEqual(false);
    _this.test1 = "ok";
    expect(Object.prototype.hasOwnProperty.call(_this, "test1")).toEqual(true);
    expect(Object.prototype.hasOwnProperty.call(_this, "test")).toEqual(false);
  });
});
