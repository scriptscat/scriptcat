// ==UserScript==
// @name         GM Storage Clone Compatibility Test
// @namespace    https://example.invalid/gm-probe
// @version      1.0.0
// @description  Regression coverage for Tampermonkey-compatible GM storage clone semantics
// @match        https://example.com/*?GM_STORAGE_CLONE_COMPATIBILITY
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setValues
// @grant        GM_listValues
// @require      https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@36ab4ce5ff23c820a32cd13ac5a04d8834ab4d82/example/tests/lib/sctest.js
// ==/UserScript==

(async function () {
  "use strict";

  if (!location.search.includes("GM_STORAGE_CLONE_COMPATIBILITY")) return;

  const { describe, check, expect, run } = SCTest.create({ name: "GM Storage Clone Compatibility" });

  const PREFIX = "__clone_probe__:";
  const DEFAULT = "__DEFAULT__";
  const SEED = "__OLD_VALUE__";

  const keys = {
    proxy: PREFIX + "proxy",
    accessor: PREFIX + "accessor",
    fn: PREFIX + "function",
    symbol: PREFIX + "symbol",
    symbolKey: PREFIX + "symbol-key",
    batchNormal: PREFIX + "batch-normal",
    batchAccessor: PREFIX + "batch-accessor",
  };

  function inspect(key) {
    return {
      listed: GM_listValues().includes(key),
      value: GM_getValue(key, DEFAULT),
    };
  }

  function runSingle(key, factory) {
    GM_setValue(key, SEED);

    let thrown;
    try {
      GM_setValue(key, factory());
    } catch (error) {
      thrown = String(error);
    }

    return {
      thrown,
      immediate: inspect(key),
    };
  }

  describe("GM_setValue clone compatibility", () => {
    check(
      "自动断言",
      "Proxy plain object is cloned instead of falling back to the default",
      () => {
        const proxyTraps = {
          ownKeys: 0,
          getOwnPropertyDescriptor: 0,
          get: 0,
        };
        const result = runSingle(keys.proxy, () => {
          const target = {
            a: 1,
            nested: { b: 2 },
          };
          return new Proxy(target, {
            ownKeys(target) {
              proxyTraps.ownKeys++;
              return Reflect.ownKeys(target);
            },
            getOwnPropertyDescriptor(target, key) {
              proxyTraps.getOwnPropertyDescriptor++;
              return Reflect.getOwnPropertyDescriptor(target, key);
            },
            get(target, key, receiver) {
              proxyTraps.get++;
              return Reflect.get(target, key, receiver);
            },
          });
        });

        expect(result.thrown).toBe(undefined);
        expect(result.immediate.listed).toBe(true);
        expect(result.immediate.value).toEqual({ a: 1, nested: { b: 2 } });
        expect(proxyTraps.ownKeys).toBe(1);
        expect(proxyTraps.getOwnPropertyDescriptor).toBe(2);
        // JSON/legacy-compatible cloning must observe property reads. Engines may additionally
        // probe toJSON, so lock the semantic lower bound instead of an engine-internal count.
        expect(proxyTraps.get >= 2).toBeTruthy();
      },
      null,
      null,
      null
    );

    check(
      "自动断言",
      "enumerable getter is evaluated exactly once and stored as a data value",
      () => {
        let getterCalls = 0;
        const result = runSingle(keys.accessor, () => {
          const value = { normal: 123 };
          Object.defineProperty(value, "calculated", {
            enumerable: true,
            configurable: true,
            get() {
              getterCalls++;
              return 456;
            },
          });
          return value;
        });

        expect(result.thrown).toBe(undefined);
        expect(getterCalls).toBe(1);
        expect(result.immediate.listed).toBe(true);
        expect(result.immediate.value).toEqual({ normal: 123, calculated: 456 });
        expect(Object.getOwnPropertyDescriptor(result.immediate.value, "calculated").get).toBe(undefined);
      },
      null,
      null,
      null
    );

    check(
      "自动断言",
      "function value becomes an existing undefined GM value without substituting the default",
      () => {
        const result = runSingle(keys.fn, () => {
          return function storedFunction() {
            return 123;
          };
        });

        expect(result.thrown).toBe(undefined);
        expect(result.immediate.listed).toBe(true);
        expect(result.immediate.value).toBe(undefined);
      },
      null,
      null,
      null
    );

    check(
      "自动断言",
      "symbol primitive becomes an existing undefined GM value without substituting the default",
      () => {
        const result = runSingle(keys.symbol, () => Symbol("stored-symbol"));

        expect(result.thrown).toBe(undefined);
        expect(result.immediate.listed).toBe(true);
        expect(result.immediate.value).toBe(undefined);
      },
      null,
      null,
      null
    );

    check(
      "自动断言",
      "symbol-keyed metadata is omitted while normal string-keyed data remains",
      () => {
        const result = runSingle(keys.symbolKey, () => {
          const meta = Symbol("private-meta");
          const value = { normal: 123 };
          Object.defineProperty(value, meta, {
            enumerable: false,
            configurable: true,
            value: "invisible metadata",
          });
          return value;
        });

        expect(result.thrown).toBe(undefined);
        expect(result.immediate.listed).toBe(true);
        expect(result.immediate.value).toEqual({ normal: 123 });
        expect(Object.getOwnPropertySymbols(result.immediate.value)).toEqual([]);
      },
      null,
      null,
      null
    );
  });

  describe("GM_setValues top-level property semantics", () => {
    check(
      "自动断言",
      "enumerable top-level accessor is read once and both batch values are updated",
      () => {
        GM_setValues({
          [keys.batchNormal]: SEED,
          [keys.batchAccessor]: SEED,
        });

        let batchGetterCalls = 0;
        const batch = {
          [keys.batchNormal]: "NEW_NORMAL",
        };
        Object.defineProperty(batch, keys.batchAccessor, {
          enumerable: true,
          configurable: true,
          get() {
            batchGetterCalls++;
            return "NEW_FROM_GETTER";
          },
        });

        let thrown;
        try {
          GM_setValues(batch);
        } catch (error) {
          thrown = String(error);
        }

        expect(thrown).toBe(undefined);
        expect(batchGetterCalls).toBe(1);
        expect(inspect(keys.batchNormal)).toEqual({ listed: true, value: "NEW_NORMAL" });
        expect(inspect(keys.batchAccessor)).toEqual({ listed: true, value: "NEW_FROM_GETTER" });
      },
      null,
      null,
      null
    );
  });

  await run();
})();
