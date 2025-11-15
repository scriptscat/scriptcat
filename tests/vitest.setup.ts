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
  setTimeoutForTest(...args: any) {
    // 注意： function XXX (){} 会导致 Class prototype 出现
    //@ts-ignore
    if (typeof this === "object" && this && this !== global) throw new TypeError("Illegal invocation");
    //@ts-ignore
    return this.setTimeout(...args);
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
