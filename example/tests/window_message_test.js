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
// @require      https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@e68d2f42b1340b476942d785c70c22b699698f0e/example/tests/lib/sctest.js
// @connect      httpbingo.org
// @run-at       document-end
// @noframes
// ==/UserScript==

(async function () {
  "use strict";

  const { describe, check, expect, run } = SCTest.create({ name: "WindowMessage 传输测试" });

  function withTimeout(promise, label, ms = 10000) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  describe("Sandbox endpoint", () => {
    check(
      "自动断言",
      "default userscript runs in the sandbox window",
      () => {
        expect(typeof unsafeWindow).toBe("object");
        expect(window !== unsafeWindow).toBeTruthy();
        expect(self).toBe(window);
        expect(globalThis).toBe(window);
      },
      null,
      null,
      null
    );
  });

  describe("One-shot sendMessage path", () => {
    check(
      "自动断言",
      "GM.setClipboard resolves through the offscreen sendMessage bridge",
      async () => {
        const text = `ScriptCat WindowMessage ${Date.now()} ${Math.random().toString(36).slice(2)}`;
        await withTimeout(GM.setClipboard(text, { type: "text", mimetype: "text/plain" }), "GM.setClipboard");
      },
      null,
      null,
      null
    );
  });

  describe("Long-lived connect path", () => {
    check(
      "自动断言",
      "GM.xmlHttpRequest receives offscreen response data over a connect channel",
      async () => {
        const marker = `window-message-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const response = await withTimeout(
          GM.xmlHttpRequest({
            method: "GET",
            url: `https://httpbingo.org/get?marker=${encodeURIComponent(marker)}`,
            responseType: "json",
          }),
          "GM.xmlHttpRequest"
        );

        expect(response.status).toBe(200);
        expect(response.finalUrl.includes("httpbingo.org/get")).toBeTruthy();
        expect(typeof response.responseHeaders === "string").toBeTruthy();
        expect(response.response && typeof response.response === "object").toBeTruthy();

        const args = response.response.args || response.response.query || response.response.params || {};
        expect(args.marker?.[0] ?? args.marker).toBe(marker);
      },
      null,
      null,
      null
    );

    check(
      "自动断言",
      "GM_xmlhttpRequest forwards readyState events over the connect channel",
      async () => {
        const states = [];
        const response = await withTimeout(
          new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
              method: "GET",
              url: "https://httpbingo.org/bytes/64",
              onreadystatechange: (res) => {
                states.push(res.readyState);
              },
              onload: resolve,
              onerror: reject,
              ontimeout: reject,
              timeout: 10000,
            });
          }),
          "GM_xmlhttpRequest readyState"
        );

        expect(response.status).toBe(200);
        expect(states.includes(4)).toBeTruthy();
        expect(response.responseText.length > 0).toBeTruthy();
      },
      null,
      null,
      null
    );

    check(
      "自动断言",
      "GM_xmlhttpRequest abort disconnects a pending connect channel",
      async () => {
        await withTimeout(
          new Promise((resolve, reject) => {
            const request = GM_xmlhttpRequest({
              method: "GET",
              url: "https://httpbingo.org/delay/5",
              onload: () => reject(new Error("request loaded before abort")),
              onerror: reject,
              ontimeout: reject,
              onabort: (res) => {
                try {
                  expect(res.readyState).toBe(0);
                  expect(res.status).toBe(0);
                  resolve();
                } catch (error) {
                  reject(error);
                }
              },
              timeout: 10000,
            });
            setTimeout(() => request.abort(), 100);
          }),
          "GM_xmlhttpRequest abort"
        );
      },
      null,
      null,
      null
    );
  });

  await run();
})();
