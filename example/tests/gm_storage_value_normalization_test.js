// ==UserScript==
// @name         GM Storage Value Normalization Test
// @namespace    https://example.invalid/gm-normalization
// @version      1.0.0
// @description  Regression coverage for ScriptCat/Tampermonkey GM storage value normalization
// @match        https://example.com/*?GM_STORAGE_VALUE_NORMALIZATION
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setValues
// @grant        GM_listValues
// @require      https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@36ab4ce5ff23c820a32cd13ac5a04d8834ab4d82/example/tests/lib/sctest.js
// ==/UserScript==

(async function () {
  "use strict";

  if (!location.search.includes("GM_STORAGE_VALUE_NORMALIZATION")) return;

  const { describe, check, expect, run } = SCTest.create({ name: "GM Storage Value Normalization" });

  const PREFIX = "__gm_normalization__:";
  const DEFAULT = "__DEFAULT__";

  function listed(key) {
    return GM_listValues().includes(key);
  }

  describe("top-level ScriptCat compatibility mapping", () => {
    check(
      "自动断言",
      "Function invalidates an existing value using ScriptCat delete semantics",
      () => {
        const key = PREFIX + "function";
        GM_setValue(key, "OLD");
        GM_setValue(key, function storedFunction() {
          return 123;
        });

        expect(listed(key)).toBe(false);
        expect(GM_getValue(key, DEFAULT)).toBe(DEFAULT);
      },
      null,
      null,
      null
    );

    check(
      "自动断言",
      "Symbol invalidates an existing value using ScriptCat delete semantics",
      () => {
        const key = PREFIX + "symbol";
        GM_setValue(key, "OLD");
        GM_setValue(key, Symbol("stored-symbol"));

        expect(listed(key)).toBe(false);
        expect(GM_getValue(key, DEFAULT)).toBe(DEFAULT);
      },
      null,
      null,
      null
    );

    check(
      "自动断言",
      "invalid top-level write is a state transition and a later valid write still replaces it",
      () => {
        const key = PREFIX + "sequence";
        GM_setValue(key, "OLD");
        GM_setValue(key, () => "invalid");
        const afterInvalid = GM_getValue(key, DEFAULT);
        GM_setValue(key, "NEW");

        expect(afterInvalid).toBe(DEFAULT);
        expect(GM_getValue(key, DEFAULT)).toBe("NEW");
        expect(listed(key)).toBe(true);
      },
      null,
      null,
      null
    );
  });

  describe("nested Tampermonkey-style normalization", () => {
    check(
      "自动断言",
      "plain object omits nested Function Symbol and undefined recursively",
      () => {
        const key = PREFIX + "object";
        GM_setValue(key, {
          before: 1,
          fn() {
            return 2;
          },
          symbol: Symbol("nested-symbol"),
          undef: undefined,
          after: 3,
          deep: {
            before: 4,
            fn() {
              return 5;
            },
            symbol: Symbol("deep-symbol"),
            undef: undefined,
            after: 6,
          },
        });

        expect(GM_getValue(key)).toEqual({
          before: 1,
          after: 3,
          deep: {
            before: 4,
            after: 6,
          },
        });
      },
      null,
      null,
      null
    );

    check(
      "自动断言",
      "array converts nested Function Symbol and undefined slots to null",
      () => {
        const key = PREFIX + "array";
        GM_setValue(key, [1, () => 2, Symbol("array-symbol"), undefined, 5]);

        expect(GM_getValue(key)).toEqual([1, null, null, null, 5]);
      },
      null,
      null,
      null
    );

    check(
      "自动断言",
      "GM_setValues applies the same top-level delete and nested normalization rules",
      () => {
        const fnKey = PREFIX + "batch-function";
        const symbolKey = PREFIX + "batch-symbol";
        const objectKey = PREFIX + "batch-object";
        const arrayKey = PREFIX + "batch-array";

        GM_setValues({
          [fnKey]: "OLD_FN",
          [symbolKey]: "OLD_SYMBOL",
        });
        GM_setValues({
          [fnKey]: () => "invalid",
          [symbolKey]: Symbol("invalid"),
          [objectKey]: { before: 1, undef: undefined, fn() {}, after: 2 },
          [arrayKey]: [1, undefined, () => 2, Symbol("nested"), 5],
        });

        expect(listed(fnKey)).toBe(false);
        expect(listed(symbolKey)).toBe(false);
        expect(GM_getValue(fnKey, DEFAULT)).toBe(DEFAULT);
        expect(GM_getValue(symbolKey, DEFAULT)).toBe(DEFAULT);
        expect(GM_getValue(objectKey)).toEqual({ before: 1, after: 2 });
        expect(GM_getValue(arrayKey)).toEqual([1, null, null, null, 5]);
      },
      null,
      null,
      null
    );
  });

  describe("ScriptCat structured-clone preservation", () => {
    check(
      "自动断言",
      "special structured-clone values are not forced through JSON normalization",
      () => {
        const key = PREFIX + "special";
        const value = {
          date: new Date("2024-01-02T03:04:05.000Z"),
          map: new Map([["a", 1]]),
          set: new Set(["x"]),
        };

        GM_setValue(key, value);
        const stored = GM_getValue(key);

        expect(stored.date instanceof Date).toBe(true);
        expect(stored.date.toISOString()).toBe("2024-01-02T03:04:05.000Z");
        expect(stored.map instanceof Map).toBe(true);
        expect(stored.map.get("a")).toBe(1);
        expect(stored.set instanceof Set).toBe(true);
        expect(stored.set.has("x")).toBe(true);
      },
      null,
      null,
      null
    );
  });

  await run();
})();
