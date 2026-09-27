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
  const STATE_KEY = PREFIX + "state-v1";
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
    { id: "nan", make: () => NaN },
    { id: "positive-infinity", make: () => Infinity },
    { id: "negative-infinity", make: () => -Infinity },
    { id: "negative-zero", make: () => -0 },
    { id: "special-object", make: makeSpecialObject },
    { id: "array-special", make: makeArraySpecial },
    { id: "bigint", make: () => 123456789012345678901234567890n, seed: true },
    { id: "cyclic-object", make: makeCycle, seed: true },
  ];

  const expected = {
    nan: { listed: true, type: "number", value: "NaN" },
    "positive-infinity": { listed: true, type: "number", value: "Infinity" },
    "negative-infinity": { listed: true, type: "number", value: "-Infinity" },
    "negative-zero": { listed: true, type: "number", value: "0" },
    "special-object": {
      listed: true,
      type: "object",
      json: JSON.stringify({
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
      }),
    },
    "array-special": {
      listed: true,
      type: "object",
      json: JSON.stringify([{}, {}, {}, { 0: 100, 1: 200, 2: 300 }]),
    },
    bigint: { listed: false, type: "missing" },
    "cyclic-object": { listed: false, type: "missing" },
  };

  function keyFor(api, id) {
    return PREFIX + api + ":" + id;
  }

  function describeKey(key) {
    const isListed = GM_listValues().includes(key);
    const value = GM_getValue(key, DEFAULT);

    if (!isListed && value === DEFAULT) {
      return { listed: false, type: "missing" };
    }

    if (typeof value === "number") {
      return {
        listed: isListed,
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

    if (value !== null && typeof value === "object") {
      return {
        listed: isListed,
        type: "object",
        json: JSON.stringify(value),
      };
    }

    if (value === undefined) {
      return { listed: isListed, type: "undefined" };
    }

    return {
      listed: isListed,
      type: value === null ? "null" : typeof value,
      value,
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
          expect(state.immediate[api]).toEqual(expected);
        },
        null,
        null,
        null
      );

      check(
        "自动断言",
        "settled same-document values remain consistent after transport echo",
        () => {
          expect(state.settled[api]).toEqual(expected);
        },
        null,
        null,
        null
      );

      check(
        "自动断言",
        "values keep the same representation after reload persistence",
        () => {
          expect(persisted[api]).toEqual(expected);
        },
        null,
        null,
        null
      );
    });
  }

  await run();
})();
