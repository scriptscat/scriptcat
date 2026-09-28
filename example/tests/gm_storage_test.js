// ==UserScript==
// @name         GM Storage Compatibility: Values, Cloning, and Persistence
// @namespace    https://example.invalid/gm-storage
// @version      1.0.0
// @description  Verifies legacy and modern GM storage behavior for structured-value cloning, value normalization and unsupported-value handling, dictionary shape, settled writes, and persistence across page reloads. Results are reported in three named SCTest suites.
// @match        https://example.com/*?GM_STORAGE_COMPATIBILITY
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setValues
// @grant        GM_listValues
// @grant        GM_deleteValue
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM_getValues
// @grant        GM.getValues
// @require      https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@36ab4ce5ff23c820a32cd13ac5a04d8834ab4d82/example/tests/lib/sctest.js
// ==/UserScript==

async function runGMStorageCloneCompatibility() {
  "use strict";

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

  function expectTopLevelInvalidated(result) {
    expect(result.thrown).toBe(undefined);

    // Tampermonkey keeps an own undefined entry for unsupported top-level values,
    // while ScriptCat maps the same transition to its historical undefined=delete model.
    // Both are compatible as long as the previous value is no longer observable.
    const deleted = !result.immediate.listed && result.immediate.value === DEFAULT;
    const storedUndefined = result.immediate.listed && result.immediate.value === undefined;
    expect(deleted || storedUndefined).toBe(true);
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
      "function value invalidates the previous top-level value",
      () => {
        const result = runSingle(keys.fn, () => {
          return function storedFunction() {
            return 123;
          };
        });

        expectTopLevelInvalidated(result);
      },
      null,
      null,
      null
    );

    check(
      "自动断言",
      "symbol primitive invalidates the previous top-level value",
      () => {
        const result = runSingle(keys.symbol, () => Symbol("stored-symbol"));

        expectTopLevelInvalidated(result);
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
}

async function runGMStoragePersistenceCompatibility() {
  "use strict";

  const PREFIX = "__gm_persistence__:";
  const STATE_KEY = PREFIX + "state-v2";
  const DEFAULT = PREFIX + "__DEFAULT__";
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  class ProbeClass {
    constructor() {
      this.number = 123;
      this.text = "class-instance";
    }

    method() {
      return "METHOD";
    }
  }

  function makeSpecialObject() {
    const error = new Error("hidden");
    error.cause = { reason: "cause" };
    error.extra = "custom-property";

    return {
      date: new Date("2024-03-14T12:34:56.789Z"),
      invalidDate: new Date(NaN),
      url: new URL("https://example.com/a/b?q=1#hash"),
      regexp: /foo\d+(bar)?/gimu,
      map: new Map([
        ["string-key", 123],
        [42, "number-key"],
      ]),
      set: new Set(["alpha", 123]),
      arrayBuffer: new Uint8Array([0, 1, 2, 255]).buffer,
      dataView: new DataView(new ArrayBuffer(8)),
      typed: new Uint8Array([9, 8, 7]),
      error,
      classInstance: new ProbeClass(),
    };
  }

  function makeArraySpecial() {
    return [
      new Date("2021-02-03T04:05:06.789Z"),
      new Map([["map", 1]]),
      new Set(["set"]),
      new Uint16Array([100, 200, 300]),
    ];
  }

  function makeCycle() {
    const value = { name: "cycle-root" };
    value.self = value;
    return value;
  }

  const cases = [
    { id: "nan", make: () => NaN, expected: NaN },
    { id: "positive-infinity", make: () => Infinity, expected: Infinity },
    { id: "negative-infinity", make: () => -Infinity, expected: -Infinity },
    { id: "negative-zero", make: () => -0, expected: 0 },
    { id: "date", make: () => new Date("2024-03-14T12:34:56.789Z"), expected: {} },
    { id: "invalid-date", make: () => new Date(NaN), expected: {} },
    { id: "url", make: () => new URL("https://example.com/a/b?q=1#hash"), expected: {} },
    { id: "regexp", make: () => /foo\d+(bar)?/gimu, expected: {} },
    {
      id: "map",
      make: () =>
        new Map([
          ["string-key", 123],
          [42, "number-key"],
        ]),
      expected: {},
    },
    { id: "set", make: () => new Set(["alpha", 123]), expected: {} },
    { id: "array-buffer", make: () => new Uint8Array([0, 1, 2, 255]).buffer, expected: {} },
    { id: "data-view", make: () => new DataView(new ArrayBuffer(8)), expected: {} },
    {
      id: "uint8array",
      make: () => new Uint8Array([0, 1, 127, 128, 255]),
      expected: { 0: 0, 1: 1, 2: 127, 3: 128, 4: 255 },
    },
    {
      id: "int16array",
      make: () => new Int16Array([-32768, -1, 0, 1, 32767]),
      expected: { 0: -32768, 1: -1, 2: 0, 3: 1, 4: 32767 },
    },
    {
      id: "float64array",
      make: () => new Float64Array([1.5, -2.25, NaN, Infinity, -Infinity]),
      expected: { 0: 1.5, 1: -2.25, 2: NaN, 3: Infinity, 4: -Infinity },
    },
    {
      id: "error",
      make: () => {
        const error = new TypeError("hidden");
        error.cause = { reason: "cause" };
        error.extra = "custom-property";
        return error;
      },
      expected: { cause: { reason: "cause" }, extra: "custom-property" },
    },
    {
      id: "class-instance",
      make: () => new ProbeClass(),
      expected: { number: 123, text: "class-instance" },
    },
    {
      id: "special-object",
      make: makeSpecialObject,
      expected: {
        date: {},
        invalidDate: {},
        url: {},
        regexp: {},
        map: {},
        set: {},
        arrayBuffer: {},
        dataView: {},
        typed: { 0: 9, 1: 8, 2: 7 },
        error: { cause: { reason: "cause" }, extra: "custom-property" },
        classInstance: { number: 123, text: "class-instance" },
      },
    },
    {
      id: "array-special",
      make: makeArraySpecial,
      expected: [{}, {}, {}, { 0: 100, 1: 200, 2: 300 }],
    },
    { id: "bigint", make: () => 123456789012345678901234567890n, seed: true, missing: true },
    { id: "cyclic-object", make: makeCycle, seed: true, missing: true },
  ];

  if (typeof Blob === "function") {
    cases.push({
      id: "blob",
      make: () => new Blob(["hello GM storage blob"], { type: "text/plain" }),
      expected: {},
    });
  }

  if (typeof File === "function") {
    cases.push({
      id: "file",
      make: () => new File(["file payload"], "probe.txt", { type: "text/plain", lastModified: 1700000000123 }),
      expected: {},
    });
  }

  function describeValue(value) {
    if (value === undefined) return { type: "undefined" };
    if (value === null) return { type: "null" };

    if (typeof value === "number") {
      return {
        type: "number",
        value: Number.isNaN(value)
          ? "NaN"
          : value === Infinity
            ? "Infinity"
            : value === -Infinity
              ? "-Infinity"
              : Object.is(value, -0)
                ? "-0"
                : String(value),
      };
    }

    if (typeof value === "bigint") {
      return { type: "bigint", value: value.toString() };
    }

    if (typeof value === "string" || typeof value === "boolean") {
      return { type: typeof value, value };
    }

    if (Array.isArray(value)) {
      return {
        type: "array",
        items: value.map((item) => describeValue(item)),
      };
    }

    if (typeof value === "object") {
      return {
        type: "object",
        entries: Object.keys(value)
          .sort()
          .map((key) => [key, describeValue(value[key])]),
      };
    }

    return { type: typeof value, value: String(value) };
  }

  const expected = {};
  for (const testCase of cases) {
    expected[testCase.id] = testCase.missing
      ? { listed: false, value: { type: "missing" } }
      : { listed: true, value: describeValue(testCase.expected) };
  }

  function sameDescriptor(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function isInvalidatedTopLevel(entry) {
    if (!entry) return false;
    if (!entry.listed && entry.value?.type === "missing") return true;
    if (entry.value?.type === "undefined" || entry.value?.type === "null") return true;
    return entry.value?.type === "string" && entry.value.value === DEFAULT;
  }

  function isCompatibleFloat64Array(entry) {
    if (!entry?.listed || entry.value?.type !== "object") return false;
    const entries = Object.fromEntries(entry.value.entries || []);

    if (!sameDescriptor(entries["0"], describeValue(1.5))) return false;
    if (!sameDescriptor(entries["1"], describeValue(-2.25))) return false;

    const special = [
      ["2", describeValue(NaN)],
      ["3", describeValue(Infinity)],
      ["4", describeValue(-Infinity)],
    ];
    return special.every(([key, exact]) => {
      const actual = entries[key];
      return sameDescriptor(actual, exact) || sameDescriptor(actual, { type: "null" });
    });
  }

  function assertCompatibleSnapshot(actual, phase) {
    const mismatches = [];

    for (const testCase of cases) {
      const id = testCase.id;
      let compatible;

      if (id === "float64array") {
        compatible = isCompatibleFloat64Array(actual[id]);
      } else if (id === "bigint") {
        // Tampermonkey exposes an own undefined entry; ScriptCat maps the same unsupported
        // top-level transition to its historical undefined=delete behavior.
        compatible =
          sameDescriptor(actual[id], expected[id]) ||
          sameDescriptor(actual[id], { listed: true, value: { type: "undefined" } }) ||
          (phase !== "persisted" && isInvalidatedTopLevel(actual[id]));
      } else if (id === "cyclic-object") {
        // Both managers reject cyclic persistence. Their same-document transient
        // cache/listing state differs, so only require the seeded OLD value
        // to be invalidated before reload.
        compatible =
          phase === "persisted"
            ? sameDescriptor(actual[id], expected[id])
            : isInvalidatedTopLevel(actual[id]);
      } else {
        compatible = sameDescriptor(actual[id], expected[id]);
      }

      if (!compatible) {
        mismatches.push(
          id + ": expected " + JSON.stringify(expected[id]) + ", actual " + JSON.stringify(actual[id])
        );
      }
    }

    if (mismatches.length > 0) {
      throw new Error("Incompatible " + phase + " storage snapshot:\n" + mismatches.join("\n"));
    }
  }
  function keyFor(api, id) {
    return PREFIX + api + ":" + id;
  }

  function describeKey(key) {
    const isListed = GM_listValues().includes(key);
    const value = GM_getValue(key, DEFAULT);

    if (!isListed && value === DEFAULT) {
      return { listed: false, value: { type: "missing" } };
    }

    return {
      listed: isListed,
      value: describeValue(value),
    };
  }

  function snapshot(api) {
    const result = {};
    for (const testCase of cases) {
      result[testCase.id] = describeKey(keyFor(api, testCase.id));
    }
    return result;
  }

  async function deleteKey(key) {
    try {
      await GM.deleteValue(key);
    } catch {
      GM_deleteValue(key);
    }
  }

  async function write(api, key, value) {
    if (api === "modern") {
      await GM.setValue(key, value);
    } else {
      GM_setValue(key, value);
    }
  }

  async function populate(api) {
    for (const testCase of cases) {
      const key = keyFor(api, testCase.id);
      await deleteKey(key);
      if (testCase.seed) {
        await write(api, key, "OLD");
      }
      await write(api, key, testCase.make());
    }
  }

  let state = null;
  try {
    state = JSON.parse(sessionStorage.getItem(STATE_KEY) || "null");
  } catch {
    sessionStorage.removeItem(STATE_KEY);
  }

  if (!state || state.phase !== "verify") {
    await populate("legacy");
    await populate("modern");

    const immediate = {
      legacy: snapshot("legacy"),
      modern: snapshot("modern"),
    };

    // Let legacy fire-and-forget transport and any echoed value updates settle before reload.
    await sleep(1200);

    const settled = {
      legacy: snapshot("legacy"),
      modern: snapshot("modern"),
    };

    sessionStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        phase: "verify",
        immediate,
        settled,
      })
    );

    location.reload();
    return;
  }

  sessionStorage.removeItem(STATE_KEY);

  const persisted = {
    legacy: snapshot("legacy"),
    modern: snapshot("modern"),
  };

  const { describe, check, expect, run } = SCTest.create({ name: "GM Storage Persistence Compatibility" });

  for (const api of ["legacy", "modern"]) {
    describe(api === "legacy" ? "GM_setValue persistence" : "GM.setValue persistence", () => {
      check(
        "自动断言",
        "immediate userscript-visible values match measured compatibility semantics",
        () => {
          assertCompatibleSnapshot(state.immediate[api], "immediate");
        },
        null,
        null,
        null
      );

      check(
        "自动断言",
        "settled same-document values remain consistent after transport echo",
        () => {
          assertCompatibleSnapshot(state.settled[api], "settled");
        },
        null,
        null,
        null
      );

      check(
        "自动断言",
        "values keep the same representation after reload persistence",
        () => {
          assertCompatibleSnapshot(persisted[api], "persisted");
        },
        null,
        null,
        null
      );
    });
  }

  await run();
}

async function runGMStorageValueNormalization() {
  "use strict";

  const { describe, check, expect, run } = SCTest.create({ name: "GM Storage Value Normalization" });

  const PREFIX = "__gm_normalization__:";
  const DEFAULT = "__DEFAULT__";

  function listed(key) {
    return GM_listValues().includes(key);
  }

  function expectNullPrototypeDictionary(value, ownKeys) {
    expect(Object.getPrototypeOf(value)).toBe(null);
    expect(value instanceof Object).toBe(false);
    expect(typeof value.hasOwnProperty).toBe("undefined");

    for (const key of ownKeys) {
      expect(Object.hasOwn(value, key)).toBe(true);
    }
  }

  function expectInvalidatedTopLevel(key) {
    const isListed = listed(key);
    const value = GM_getValue(key, DEFAULT);

    // ScriptCat intentionally maps top-level unsupported values to delete.
    // Tampermonkey keeps an own undefined value. Both are compatible here as long as the
    // previous value is invalidated and no old value remains observable.
    const scriptCatDelete = !isListed && value === DEFAULT;
    const tampermonkeyUndefined = isListed && value === undefined;
    expect(scriptCatDelete || tampermonkeyUndefined).toBe(true);
  }

  describe("GM_getValues dictionary shape", () => {
    check(
      "自动断言",
      "all legacy and modern GM_getValues forms return null-prototype dictionaries",
      async () => {
        const normalKey = PREFIX + "shape-normal";
        const keys = [normalKey, "__proto__", "constructor", "toString"];

        GM_setValue(normalKey, "NORMAL");
        GM_setValue("__proto__", "PROTO");
        GM_setValue("constructor", "CONSTRUCTOR");
        GM_setValue("toString", "TOSTRING");

        const defaults = {};
        for (const [key, value] of [
          [normalKey, "DEFAULT-NORMAL"],
          ["__proto__", "DEFAULT-PROTO"],
          ["constructor", "DEFAULT-CONSTRUCTOR"],
          ["toString", "DEFAULT-TOSTRING"],
        ]) {
          Object.defineProperty(defaults, key, {
            configurable: true,
            enumerable: true,
            writable: true,
            value,
          });
        }

        const nullDefaults = Object.create(null);
        for (const key of Reflect.ownKeys(defaults)) {
          Object.defineProperty(nullDefaults, key, Object.getOwnPropertyDescriptor(defaults, key));
        }

        const results = [
          GM_getValues(keys),
          GM_getValues(defaults),
          GM_getValues(nullDefaults),
          GM_getValues(null),
          GM_getValues(undefined),
          await GM.getValues(keys),
          await GM.getValues(defaults),
          await GM.getValues(nullDefaults),
          await GM.getValues(null),
          await GM.getValues(undefined),
        ];

        for (const result of results) {
          expectNullPrototypeDictionary(result, keys);
          expect(result[normalKey]).toBe("NORMAL");
          expect(result.__proto__).toBe("PROTO");
          expect(result.constructor).toBe("CONSTRUCTOR");
          expect(result.toString).toBe("TOSTRING");
        }
      },
      null,
      null,
      null
    );
  });

  describe("top-level cross-manager compatibility", () => {
    check(
      "自动断言",
      "Function invalidates an existing value without preserving the old value",
      () => {
        const key = PREFIX + "function";
        GM_setValue(key, "OLD");
        GM_setValue(key, function storedFunction() {
          return 123;
        });

        expectInvalidatedTopLevel(key);
      },
      null,
      null,
      null
    );

    check(
      "自动断言",
      "Symbol invalidates an existing value without preserving the old value",
      () => {
        const key = PREFIX + "symbol";
        GM_setValue(key, "OLD");
        GM_setValue(key, Symbol("stored-symbol"));

        expectInvalidatedTopLevel(key);
      },
      null,
      null,
      null
    );

    check(
      "自动断言",
      "BigInt invalidates an existing value without preserving the old value",
      () => {
        const key = PREFIX + "bigint";
        GM_setValue(key, "OLD");
        GM_setValue(key, 123n);

        expectInvalidatedTopLevel(key);
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
        expectInvalidatedTopLevel(key);

        GM_setValue(key, "NEW");

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

        expectInvalidatedTopLevel(fnKey);
        expectInvalidatedTopLevel(symbolKey);
        expect(GM_getValue(objectKey)).toEqual({ before: 1, after: 2 });
        expect(GM_getValue(arrayKey)).toEqual([1, null, null, null, 5]);
      },
      null,
      null,
      null
    );
  });

  describe("measured scalar and object compatibility", () => {
    check(
      "自动断言",
      "non-array special objects become enumerable-property bags",
      () => {
        const key = PREFIX + "special-property-bags";
        const error = new Error("hidden");
        error.cause = { reason: "cause" };
        error.extra = "visible";
        class ProbeClass {
          constructor() {
            this.number = 123;
            this.text = "class-instance";
          }

          method() {
            return "METHOD";
          }
        }

        GM_setValue(key, {
          date: new Date("2024-01-02T03:04:05.000Z"),
          invalidDate: new Date(NaN),
          url: new URL("https://example.com/path"),
          regexp: /probe/gi,
          map: new Map([["a", 1]]),
          set: new Set(["x"]),
          arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
          dataView: new DataView(new ArrayBuffer(4)),
          typed: new Uint8Array([9, 8, 7]),
          error,
          classInstance: new ProbeClass(),
        });

        expect(GM_getValue(key)).toEqual({
          date: {},
          invalidDate: {},
          url: {},
          regexp: {},
          map: {},
          set: {},
          arrayBuffer: {},
          dataView: {},
          typed: { 0: 9, 1: 8, 2: 7 },
          error: { cause: { reason: "cause" }, extra: "visible" },
          classInstance: { number: 123, text: "class-instance" },
        });
      },
      null,
      null,
      null
    );

    check(
      "自动断言",
      "special objects nested in arrays keep array shape and use property-bag serialization",
      () => {
        const key = PREFIX + "array-special-types";
        GM_setValue(key, [
          new Date("2021-02-03T04:05:06.789Z"),
          new Map([["map", 1]]),
          new Set(["set"]),
          new Uint16Array([100, 200, 300]),
        ]);

        expect(GM_getValue(key)).toEqual([{}, {}, {}, { 0: 100, 1: 200, 2: 300 }]);
      },
      null,
      null,
      null
    );

    check(
      "自动断言",
      "negative zero is canonicalized to positive zero",
      () => {
        const key = PREFIX + "negative-zero";
        GM_setValue(key, -0);
        const stored = GM_getValue(key);

        expect(stored).toBe(0);
        expect(Object.is(stored, -0)).toBe(false);
      },
      null,
      null,
      null
    );

    check(
      "自动断言",
      "GM.setValue keeps NaN and infinities lossless after await",
      async () => {
        const values = {
          nan: NaN,
          positiveInfinity: Infinity,
          negativeInfinity: -Infinity,
        };

        for (const [name, value] of Object.entries(values)) {
          const key = PREFIX + "async-" + name;
          await GM.setValue(key, value);
          const stored = GM_getValue(key);

          if (Number.isNaN(value)) {
            expect(Number.isNaN(stored)).toBe(true);
          } else {
            expect(stored).toBe(value);
          }
        }
      },
      null,
      null,
      null
    );
  });

  await run();
}

(async function runGMStorageCompatibility() {
  "use strict";

  if (!location.search.includes("GM_STORAGE_COMPATIBILITY")) return;

  let persistenceState = null;
  try {
    persistenceState = JSON.parse(sessionStorage.getItem("__gm_persistence__:state-v2") || "null");
  } catch {
    sessionStorage.removeItem("__gm_persistence__:state-v2");
  }

  if (persistenceState?.phase === "verify") {
    await runGMStoragePersistenceCompatibility();
    return;
  }

  await runGMStorageCloneCompatibility();
  await runGMStorageValueNormalization();
  await runGMStoragePersistenceCompatibility();
})();
