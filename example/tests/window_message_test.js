// ==UserScript==
// @name         WindowMessage Transport Test
// @namespace    https://docs.scriptcat.org/
// @version      0.1.0
// @description  Verifies the WindowMessage paths used by ScriptCat sandbox and offscreen pages.
// @author       ScriptCat
// @match        *://*/*?WINDOW_MESSAGE_TEST_SC
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        GM.setClipboard
// @grant        unsafeWindow
// @connect      httpbun.com
// @run-at       document-end
// @noframes
// ==/UserScript==

(async function () {
  "use strict";

  const results = {
    passed: 0,
    failed: 0,
    total: 0,
  };

  console.log(
    "%c=== WindowMessage transport test start ===",
    "color: blue; font-size: 16px; font-weight: bold;",
  );
  console.log(
    "This userscript exercises the production WindowMessage route used by the sandbox/offscreen document. Run it on a URL ending with ?WINDOW_MESSAGE_TEST_SC.",
  );

  function section(name) {
    console.log(`\n%c--- ${name} ---`, "color: orange; font-weight: bold;");
  }

  function assertSame(expected, actual, message) {
    if (!Object.is(expected, actual)) {
      throw new Error(
        `${message} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      );
    }
  }

  function assertTrue(condition, message) {
    if (!condition) {
      throw new Error(message || "Assertion failed");
    }
  }

  function withTimeout(promise, label, ms = 10000) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function test(name, fn) {
    results.total++;
    try {
      await fn();
      results.passed++;
      console.log(`%cPASS ${name}`, "color: green;");
      return true;
    } catch (error) {
      results.failed++;
      console.error(`%cFAIL ${name}`, "color: red;", error);
      return false;
    }
  }

  section("Sandbox endpoint");

  await test("default userscript runs in the sandbox window", () => {
    assertSame("object", typeof unsafeWindow, "unsafeWindow should be available");
    assertTrue(window !== unsafeWindow, "window should be the sandbox window, not the page window");
    assertSame(window, self, "self should point at the sandbox window");
    assertSame(window, globalThis, "globalThis should point at the sandbox window");
  });

  section("One-shot sendMessage path");

  await test("GM.setClipboard resolves through the offscreen sendMessage bridge", async () => {
    const text = `ScriptCat WindowMessage ${Date.now()} ${Math.random().toString(36).slice(2)}`;
    await withTimeout(GM.setClipboard(text, { type: "text", mimetype: "text/plain" }), "GM.setClipboard");
  });

  section("Long-lived connect path");

  await test("GM.xmlHttpRequest receives offscreen response data over a connect channel", async () => {
    const marker = `window-message-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const response = await withTimeout(
      GM.xmlHttpRequest({
        method: "GET",
        url: `https://httpbun.com/get?marker=${encodeURIComponent(marker)}`,
        responseType: "json",
      }),
      "GM.xmlHttpRequest",
    );

    assertSame(200, response.status, "status should be 200");
    assertTrue(response.finalUrl.includes("httpbun.com/get"), "finalUrl should be populated");
    assertTrue(typeof response.responseHeaders === "string", "responseHeaders should be a string");
    assertTrue(response.response && typeof response.response === "object", "JSON response should be parsed");

    const args =
      response.response.args ||
      response.response.query ||
      response.response.params ||
      {};
    assertSame(marker, args.marker, "query marker should round-trip through the response");
  });

  await test("GM_xmlhttpRequest forwards readyState events over the connect channel", async () => {
    const states = [];
    const response = await withTimeout(
      new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: "https://httpbun.com/bytes/64",
          onreadystatechange: (res) => {
            states.push(res.readyState);
          },
          onload: resolve,
          onerror: reject,
          ontimeout: reject,
          timeout: 10000,
        });
      }),
      "GM_xmlhttpRequest readyState",
    );

    assertSame(200, response.status, "status should be 200");
    assertTrue(states.includes(4), "readyState DONE should be observed");
    assertTrue(response.responseText.length > 0, "responseText should contain the payload");
  });

  await test("GM_xmlhttpRequest abort disconnects a pending connect channel", async () => {
    await withTimeout(
      new Promise((resolve, reject) => {
        const request = GM_xmlhttpRequest({
          method: "GET",
          url: "https://httpbun.com/delay/5",
          onload: () => reject(new Error("request loaded before abort")),
          onerror: reject,
          ontimeout: reject,
          onabort: (res) => {
            try {
              assertSame(0, res.readyState, "aborted readyState should be UNSENT");
              assertSame(0, res.status, "aborted status should be 0");
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          timeout: 10000,
        });
        setTimeout(() => request.abort(), 100);
      }),
      "GM_xmlhttpRequest abort",
    );
  });

  console.log(
    "\n%c=== WindowMessage transport test complete ===",
    "color: blue; font-size: 16px; font-weight: bold;",
  );
  console.log(
    `%cTotal: ${results.total} | Passed: ${results.passed} | Failed: ${results.failed}`,
    results.failed === 0
      ? "color: green; font-weight: bold;"
      : "color: red; font-weight: bold;",
  );
})();
