// ==UserScript==
// @name         GM_xmlhttpRequest cookie 覆盖测试 - tampermonkey/tampermonkey#2754 #2829
// @namespace    tm-gmxhr-cookie-test
// @version      1.0.2
// @description  验证 GM_xmlhttpRequest 的 cookie 参数语义：脚本指定的名称完全覆盖，未指定的名称原样保留（含同名多值场景）
// @match        https://oof.ooo/*?GM_XHR_COOKIE_TEST_SC
// @grant        GM_xmlhttpRequest
// @connect      oof.ooo
// @noframes
// ==/UserScript==

(async function () {
  "use strict";

  console.log(
    "%c=== GM_xmlhttpRequest cookie 覆盖测试开始 ===",
    "color: blue; font-size: 16px; font-weight: bold;"
  );

  const OOF = "https://oof.ooo";

  const testResults = {
    passed: 0,
    failed: 0,
    total: 0,
  };

  async function test(name, fn) {
    testResults.total++;

    try {
      await fn();
      testResults.passed++;
      console.log(`%c✓ ${name}`, "color: green;");
      return true;
    } catch (error) {
      testResults.failed++;
      console.error(`%c✗ ${name}`, "color: red;", error);
      return false;
    }
  }

  function assert(expected, actual, message) {
    if (expected !== actual) {
      const valueInfo =
        `期望 ${JSON.stringify(expected)}, ` +
        `实际 ${JSON.stringify(actual)}`;

      throw new Error(
        message
          ? `${message} - ${valueInfo}`
          : `断言失败: ${valueInfo}`
      );
    }
  }

  function assertTrue(condition, message) {
    if (!condition) {
      throw new Error(message || "断言失败: 期望条件为真");
    }
  }

  function gmRequest(details) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        ...details,

        onload: (response) => {
          if (response.status >= 200 && response.status < 300) {
            resolve(response);
          } else {
            reject(
              new Error(
                `HTTP 请求失败: ${response.status} ${response.statusText || ""}`
              )
            );
          }
        },

        onerror: (response) => {
          reject(
            new Error(
              `GM_xmlhttpRequest 网络错误: ${
                response?.error || response?.statusText || "未知错误"
              }`
            )
          );
        },

        ontimeout: () => {
          reject(new Error("GM_xmlhttpRequest 请求超时"));
        },
      });
    });
  }

  /**
   * 解析 /headers 响应。
   */
  function getResponseHeadersBody(response) {
    let body;

    try {
      body = JSON.parse(response.responseText);
    } catch (error) {
      throw new Error(
        `oof.ooo /headers 返回的内容不是有效 JSON: ${response.responseText}`
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error(
        `oof.ooo /headers 返回了非预期响应: ${response.responseText}`
      );
    }

    if (
      body.headers &&
      typeof body.headers === "object" &&
      !Array.isArray(body.headers)
    ) {
      return body.headers;
    }

    return body;
  }

  function getHeaderCaseInsensitive(headers, headerName) {
    const targetName = headerName.toLowerCase();

    for (const [name, value] of Object.entries(headers)) {
      if (name.toLowerCase() === targetName) {
        return value;
      }
    }

    return undefined;
  }

  function getCookieHeader(response) {
    const headers = getResponseHeadersBody(response);
    const cookieHeader = getHeaderCaseInsensitive(headers, "cookie");

    if (cookieHeader == null) {
      return "";
    }

    if (Array.isArray(cookieHeader)) {
      return cookieHeader.join("; ");
    }

    return String(cookieHeader);
  }

  /**
   * 解析 Cookie 请求头字符串为 name -> value[] 的多重映射。
   *
   * 同名 Cookie 多值时保留全部值，不假设顺序。
   */
  function parseCookieMultiMap(cookieHeader) {
    const map = new Map();

    for (const part of String(cookieHeader || "").split(";")) {
      const trimmed = part.trim();

      if (!trimmed) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const name = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();

      if (!name) {
        continue;
      }

      if (!map.has(name)) {
        map.set(name, []);
      }

      map.get(name).push(value);
    }

    return map;
  }

  function assertCookieValues(map, name, expectedValues, message) {
    const actual = (map.get(name) || []).slice().sort();
    const expected = expectedValues.slice().sort();

    assert(
      JSON.stringify(expected),
      JSON.stringify(actual),
      message || `cookie "${name}" 的值集合`
    );
  }

  // ---------- Cookie 辅助函数 ----------
  //
  // 借由不同的 path 属性，在同一名称下制造多值 Cookie。
  // 浏览器允许同名 Cookie 因 path 不同而共存。
  //
  // path=/ 和 path=/headers 都会匹配：
  // https://oof.ooo/headers
  const ROOT = "/";
  const SUB = "/headers";

  function setCookie(name, value, path) {
    document.cookie = `${name}=${value}; path=${path}; SameSite=Lax`;
  }

  function clearCookie(name, path) {
    document.cookie =
      `${name}=; path=${path}; max-age=0; SameSite=Lax`;
  }

  // 测试 Cookie 名称使用 mBS 格式：
  //
  // B = 浏览器已有的同名 Cookie 数量：0、1、2
  // S = GM_xmlhttpRequest cookie 参数指定的值数量：
  //     0 表示未指定，1 表示单值，2 表示多值
  const NAMES = [
    "m00",
    "m01",
    "m02",
    "m10",
    "m11",
    "m12",
    "m20",
    "m21",
    "m22",
  ];

  function resetCookies() {
    for (const name of NAMES) {
      clearCookie(name, ROOT);
      clearCookie(name, SUB);
    }

    clearCookie("data", ROOT);
    clearCookie("data", SUB);

    clearCookie("data1", ROOT);
    clearCookie("data1", SUB);

    clearCookie("data2", ROOT);
    clearCookie("data2", SUB);
  }

  function setupCookies() {
    // 浏览器已有 1 个同名值：只在 path=/ 设置。
    setCookie("m10", "old", ROOT);
    setCookie("m11", "old", ROOT);
    setCookie("m12", "old", ROOT);

    // 浏览器已有 2 个同名值：
    // path=/ 与 path=/headers 各设置一个。
    setCookie("m20", "old1", ROOT);
    setCookie("m20", "old2", SUB);

    setCookie("m21", "old1", ROOT);
    setCookie("m21", "old2", SUB);

    setCookie("m22", "old1", ROOT);
    setCookie("m22", "old2", SUB);
  }

  resetCookies();
  setupCookies();

  try {
    // ============ TM #2754 复现 ============
    console.log(
      "\n%c--- TM #2754: 同名 cookie 应覆盖而非追加 ---",
      "color: orange; font-weight: bold;"
    );

    await test(
      "document.cookie=data=1，GM_xhr cookie: data=2 时应只送出 data=2",
      async () => {
        setCookie("data", "1", ROOT);

        try {
          const response = await gmRequest({
            method: "GET",
            url: `${OOF}/headers`,
            cookie: "data=2",
            timeout: 15000,
          });

          const cookieHeader = getCookieHeader(response);
          const cookieMap = parseCookieMultiMap(cookieHeader);

          assertCookieValues(
            cookieMap,
            "data",
            ["2"],
            "data 应只保留脚本指定的值"
          );
        } finally {
          clearCookie("data", ROOT);
        }
      }
    );

    // ============ TM #2829 复现 ============
    console.log(
      "\n%c--- TM #2829: 多个不同名 cookie 不应被截断 ---",
      "color: orange; font-weight: bold;"
    );

    await test(
      'GM_xhr cookie: "data1=1; data2=2" 应两者都送出，而非只剩第一个',
      async () => {
        const response = await gmRequest({
          method: "GET",
          url: `${OOF}/headers`,
          cookie: "data1=1; data2=2",
          timeout: 15000,
        });

        const cookieHeader = getCookieHeader(response);
        const cookieMap = parseCookieMultiMap(cookieHeader);

        assertCookieValues(
          cookieMap,
          "data1",
          ["1"],
          "data1 应存在"
        );

        assertCookieValues(
          cookieMap,
          "data2",
          ["2"],
          "data2 不应被截断丢失"
        );
      }
    );

    // ============ 完整矩阵 ============
    console.log(
      "\n%c--- 完整矩阵：浏览器已有(0/1/2) × 脚本指定(0/1/2) ---",
      "color: orange; font-weight: bold;"
    );

    let lastCookieMap = null;

    const matrixRequestPassed = await test(
      "发送带完整矩阵 cookie 参数的请求",
      async () => {
        const customCookie = [
          "m01=new",
          "m02=new1",
          "m02=new2",
          "m11=new",
          "m12=new1",
          "m12=new2",
          "m21=new",
          "m22=new1",
          "m22=new2",
        ].join("; ");

        const response = await gmRequest({
          method: "GET",
          url: `${OOF}/headers`,
          cookie: customCookie,
          timeout: 15000,
        });

        const cookieHeader = getCookieHeader(response);

        lastCookieMap = parseCookieMultiMap(cookieHeader);

        assertTrue(cookieHeader.length > 0, "应收到 Cookie header");
        assertTrue(lastCookieMap.size > 0, "Cookie header 应能成功解析");
      }
    );

    if (matrixRequestPassed && lastCookieMap) {
      await test(
        "m00：浏览器无、脚本未指定 → 不应出现",
        () => {
          assertCookieValues(lastCookieMap, "m00", []);
        }
      );

      await test(
        "m01：浏览器无、脚本指定单值 → 应为脚本值",
        () => {
          assertCookieValues(lastCookieMap, "m01", ["new"]);
        }
      );

      await test(
        "m02：浏览器无、脚本指定多值 → 应为脚本两个值",
        () => {
          assertCookieValues(lastCookieMap, "m02", [
            "new1",
            "new2",
          ]);
        }
      );

      await test(
        "m10：浏览器单值、脚本未指定 → 应保留浏览器原值",
        () => {
          assertCookieValues(lastCookieMap, "m10", ["old"]);
        }
      );

      await test(
        "m11：浏览器单值、脚本指定单值 → 应覆盖为脚本值",
        () => {
          assertCookieValues(lastCookieMap, "m11", ["new"]);
        }
      );

      await test(
        "m12：浏览器单值、脚本指定多值 → 应覆盖为脚本两个值",
        () => {
          assertCookieValues(lastCookieMap, "m12", [
            "new1",
            "new2",
          ]);
        }
      );

      await test(
        "m20：浏览器多值(同名不同path)、脚本未指定 → 应保留浏览器全部值",
        () => {
          assertCookieValues(lastCookieMap, "m20", [
            "old1",
            "old2",
          ]);
        }
      );

      await test(
        "m21：浏览器多值、脚本指定单值 → 应完全覆盖为脚本单一值",
        () => {
          assertCookieValues(lastCookieMap, "m21", ["new"]);
        }
      );

      await test(
        "m22：浏览器多值、脚本指定多值 → 应完全覆盖为脚本两个值",
        () => {
          assertCookieValues(lastCookieMap, "m22", [
            "new1",
            "new2",
          ]);
        }
      );
    } else {
      console.warn(
        "%c完整矩阵请求失败，跳过依赖该请求结果的矩阵断言。",
        "color: orange; font-weight: bold;"
      );
    }
  } finally {
    resetCookies();
  }

  // ============ 输出测试结果 ============
  console.log(
    "\n%c=== 测试完成 ===",
    "color: blue; font-size: 16px; font-weight: bold;"
  );

  console.log(
    `%c总计: ${testResults.total} | ` +
      `通过: ${testResults.passed} | ` +
      `失败: ${testResults.failed}`,
    testResults.failed === 0
      ? "color: green; font-weight: bold;"
      : "color: red; font-weight: bold;"
  );

  if (testResults.failed === 0) {
    console.log(
      "%c🎉 所有测试通过!",
      "color: green; font-size: 14px; font-weight: bold;"
    );
  } else {
    console.log(
      "%c⚠️ 部分测试失败，请检查上面的错误信息",
      "color: red; font-size: 14px; font-weight: bold;"
    );
  }
})();
