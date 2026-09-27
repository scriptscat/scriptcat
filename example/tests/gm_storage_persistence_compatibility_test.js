// ==UserScript==
// @name         GM Storage Persistence Compatibility Test
// @namespace    https://example.invalid/gm-persistence
// @version      1.0.0
// @description  Regression coverage for immediate/settled/persisted GM storage compatibility
// @match        https://example.com/*?GM_STORAGE_PERSISTENCE_COMPATIBILITY
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @require      https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@36ab4ce5ff23c820a32cd13ac5a04d8834ab4d82/example/tests/lib/sctest.js
// ==/UserScript==

(async function () {
  "use strict";

  if (!location.search.includes("GM_STORAGE_PERSISTENCE_COMPATIBILITY")) return;

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
})();
