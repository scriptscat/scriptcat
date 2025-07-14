import chromeMock from "@Packages/chrome-extension-mock";

chromeMock.init();

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

//@ts-ignore
global.sandboxTestValue = "sandboxTestValue";
//@ts-ignore
global.sandboxTestValue2 = "sandboxTestValue2";

//@ts-ignore
global.ttest1 = 1;
//@ts-ignore
global.ttest2 = 2;
