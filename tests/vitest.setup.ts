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
    }
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
    }
  });
}

Object.assign(global, {
  setTimeoutForTest(...args: any) { // 注意： function XXX (){} 会导致 Class prototype 出现
    //@ts-ignore
    if (typeof this === 'object' && this && this !== global) throw new TypeError("Illegal invocation");
    //@ts-ignore
    return this.setTimeout(...args);
  }
});

