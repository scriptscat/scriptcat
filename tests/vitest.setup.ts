import chromeMock from "@Packages/chrome-extension-mock";
import { initTestEnv } from "./utils";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";
import { MockRequest } from "./mocks/request";
import { MockBlob } from "./mocks/blob";
import { MockResponse } from "./mocks/response";
import { mockFetch } from "./mocks/fetch";

vi.stubGlobal("chrome", chromeMock);
chromeMock.init();
initTestEnv();

chromeMock.runtime.getURL = vi.fn().mockImplementation((path: string) => {
  return `chrome-extension://${chrome.runtime.id}${path}`;
});

const isPrimitive = (x: any) => x !== Object(x);

// Window.prototype[Symbol.toStringTag] = "Window"
Object.defineProperty(Object.getPrototypeOf(global), Symbol.toStringTag, {
  value: "Window",
  writable: false,
  enumerable: false,
  configurable: true,
});
// 先改变 global[Symbol.toStringTag] 定义
Object.defineProperty(global, Symbol.toStringTag, {
  value: undefined,
  writable: false,
  enumerable: false,
  configurable: true,
});
// 删除 global 表面的 property，使用 Window.prototype[Symbol.toStringTag]
//@ts-expect-error
if (!global[Symbol.toStringTag]) delete global[Symbol.toStringTag];

const gblAddEventListener = Object.getPrototypeOf(global).addEventListener || global.addEventListener;
const gblRemoveEventListener = Object.getPrototypeOf(global).removeEventListener || global.removeEventListener;
class EventTargetE {
  addEventListener(a: any, b: any, ...args: any[]) {
    return gblAddEventListener.call(this, a, b, ...args);
  }
  removeEventListener(a: any, ...args: any[]) {
    return gblRemoveEventListener.call(this, a, ...args);
  }
}
// 为了确保全局 addEventListener/removeEventListener 行为符合预期，需要彻底移除 global 及其原型链上的相关属性，
// 然后在原型链上重新定义。此处操作较为复杂，务必小心维护。
// 先安全地删除 global 上的 addEventListener/removeEventListener
if (Object.getOwnPropertyDescriptor(global, "addEventListener")) {
  // @ts-ignore
  delete global.addEventListener;
}
if (Object.getOwnPropertyDescriptor(global, "removeEventListener")) {
  // @ts-ignore
  delete global.removeEventListener;
}
// 再删除 global 的原型上的属性
const globalProto = Object.getPrototypeOf(global);
if (globalProto && Object.getOwnPropertyDescriptor(globalProto, "addEventListener")) {
  // @ts-ignore
  delete globalProto.addEventListener;
}
if (globalProto && Object.getOwnPropertyDescriptor(globalProto, "removeEventListener")) {
  // @ts-ignore
  delete globalProto.removeEventListener;
}
// 继续向上查找一层原型（防御性检查）
const globalProtoProto = globalProto && Object.getPrototypeOf(globalProto);
if (globalProtoProto && Object.getOwnPropertyDescriptor(globalProtoProto, "addEventListener")) {
  // @ts-ignore
  delete globalProtoProto.addEventListener;
}
if (globalProtoProto && Object.getOwnPropertyDescriptor(globalProtoProto, "removeEventListener")) {
  // @ts-ignore
  delete globalProtoProto.removeEventListener;
}
// 在 global 的原型上重新定义方法
if (globalProto) {
  globalProto.addEventListener = EventTargetE.prototype.addEventListener;
  globalProto.removeEventListener = EventTargetE.prototype.removeEventListener;
}
if (!("onanimationstart" in global)) {
  // Define or mock the global handler
  let val: any = null;
  Object.defineProperty(global, "onanimationstart", {
    configurable: true,
    enumerable: true,
    set(newVal) {
      if (isPrimitive(newVal)) newVal = null;
      val = newVal;
    },
    get() {
      return val;
    },
  });
}

//@ts-ignore
delete global.onload;

if (!("onload" in global)) {
  // Define or mock the global handler
  let val: any = null;
  Object.defineProperty(global, "onload", {
    configurable: true,
    enumerable: true,
    set(newVal) {
      if (isPrimitive(newVal)) newVal = null;
      val = newVal;
    },
    get() {
      return val;
    },
  });
}

//@ts-ignore
delete global.onresize;

if (!("onresize" in global)) {
  // Define or mock the global handler
  Object.defineProperty(global, "onresize", {
    configurable: true,
    enumerable: true,
    set(_newVal) {
      console.log("测试用.onresize.set");
    },
    get() {
      console.log("测试用.onresize.get");
      return null;
    },
  });
}

//@ts-ignore
delete global.onblur;

if (!("onblur" in global)) {
  // Define or mock the global handler
  Object.defineProperty(global, "onblur", {
    configurable: true,
    enumerable: true,
    set(_newVal) {
      console.log("测试用.onblur.set");
    },
    get() {
      console.log("测试用.onblur.get");
      return null;
    },
  });
}

//@ts-ignore
delete global.onfocus;

if (!("onblur" in global)) {
  // Define or mock the global handler
  Object.defineProperty(global, "onfocus", {
    configurable: true,
    enumerable: true,
    set(_newVal) {
      console.log("测试用.onfocus.set");
    },
    get() {
      console.log("测试用.onfocus.get");
      return null;
    },
  });
}

Object.assign(global, {
  setTimeoutForTest1(...args: any) {
    // 注意： function XXX (){} 会导致 Class prototype 出现
    //@ts-ignore
    if (typeof this === "object" && this && this !== global) throw new TypeError("Illegal invocation");
    //@ts-ignore
    return this.setTimeout(...args);
  },
});
//@ts-ignore 强行修改 setTimeoutForTest1 toString 为 原生代码显示
global.setTimeoutForTest1.toString = () =>
  `${Object.propertyIsEnumerable}`.replace("propertyIsEnumerable", "setTimeoutForTest1");

Object.assign(global, {
  setTimeoutForTest2(...args: any) {
    // 注意： function XXX (){} 会导致 Class prototype 出现
    //@ts-ignore
    if (typeof this === "object" && this && this !== global) throw new TypeError("Illegal invocation");
    //@ts-ignore
    return this.setTimeout(...args);
  },
});
//@ts-ignore 强行修改 setTimeoutForTest2 toString 为 原生代码显示
global.setTimeoutForTest2.toString = () =>
  `${Object.propertyIsEnumerable}`.replace("propertyIsEnumerable", "setTimeoutForTest2");

//@ts-ignore 模拟扩展拦截
global.setTimeoutForTest2 = new Proxy(global.setTimeoutForTest2, {
  apply: (target, thisArg, argArray) => {
    return target.call(
      thisArg,
      () => {
        argArray[0]("proxy");
      },
      argArray[1]
    );
  },
});

vi.stubGlobal("sandboxTestValue", "sandboxTestValue");
vi.stubGlobal("sandboxTestValue2", "sandboxTestValue2");

vi.stubGlobal("ttest1", 1);
vi.stubGlobal("ttest2", 2);

// Install globals
vi.stubGlobal("fetch", mockFetch);
vi.stubGlobal("Request", MockRequest);
vi.stubGlobal("Response", MockResponse);
vi.stubGlobal("Blob", MockBlob);

vi.stubGlobal("define", "特殊关键字不能穿透沙盒");

//@ts-expect-error
if (!URL.createObjectURL) URL.createObjectURL = undefined;
//@ts-expect-error
if (!URL.revokeObjectURL) URL.revokeObjectURL = undefined;

const simulatedEventTarget = Object.create(EventTarget.prototype);
simulatedEventTarget.addEventListener = vi.fn();
simulatedEventTarget.removeEventListener = vi.fn();
simulatedEventTarget.dispatchEvent = vi.fn();
vi.stubGlobal("simulatedEventTarget", simulatedEventTarget);
