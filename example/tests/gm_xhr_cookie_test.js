// ==UserScript==
// @name         GM_xmlhttpRequest cookie 覆盖测试 - tampermonkey/tampermonkey#2754 #2829
// @namespace    tm-gmxhr-cookie-test
// @version      1.0.3
// @description  验证 GM_xmlhttpRequest 的 cookie 参数语义：脚本指定的名称完全覆盖，未指定的名称原样保留（含同名多值场景）
// @match        https://mockhttp.org/*?GM_XHR_COOKIE_TEST_SC
// @grant        GM_xmlhttpRequest
// @require      https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@main/example/tests/lib/sctest.js
// @connect      mockhttp.org
// @noframes
// ==/UserScript==

(async function () {
  "use strict";

  const { describe, it, expect, run } = SCTest.create({ name: "GM_xmlhttpRequest cookie 覆盖测试" });

  const MOCKHTTP = "https://mockhttp.org";

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
                `HTTP 请求失败: ${response.status} ${
                  response.statusText || ""
                }`
              )
            );
          }
        },

        onerror: (response) => {
          reject(
            new Error(
              `GM_xmlhttpRequest 网络错误: ${
                response?.error ||
                response?.statusText ||
                "未知错误"
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
   * 解析 mockhttp.org/headers 响应。
   */
  function getResponseHeadersBody(response) {
    let body;

    try {
      body = JSON.parse(response.responseText);
    } catch (error) {
      throw new Error(
        `mockhttp.org/headers 返回的内容不是有效 JSON: ${
          response.responseText
        }`
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error(
        `mockhttp.org/headers 返回了非预期响应: ${
          response.responseText
        }`
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
    const cookieHeader = getHeaderCaseInsensitive(
      headers,
      "cookie"
    );

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

      const name = trimmed
        .slice(0, separatorIndex)
        .trim();

      const value = trimmed
        .slice(separatorIndex + 1)
        .trim();

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

  function assertCookieValues(
    map,
    name,
    expectedValues,
    message
  ) {
    const actual = (map.get(name) || []).slice().sort();
    const expected = expectedValues.slice().sort();

    expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
  }

  // ---------- Cookie 辅助函数 ----------
  //
  // 借由不同的 path 属性，在同一名称下制造多值 Cookie。
  // 浏览器允许同名 Cookie 因 path 不同而共存。
  //
  // path=/ 和 path=/headers 都会匹配：
  // https://mockhttp.org/headers
  const ROOT = "/";
  const SUB = "/headers";

  function setCookie(name, value, path) {
    document.cookie =
      `${name}=${value}; path=${path}; SameSite=Lax`;
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

  let lastCookieMap = null;
  // 复刻原 `if (matrixRequestPassed && lastCookieMap)` 门控：矩阵请求失败时，其依赖用例应跳过
  // 而非各自级联失败（声明式框架无法条件注册用例，故用运行时 skip 表达同一依赖关系）。
  let matrixOk = false;

  describe("TM #2754: 同名 cookie 应覆盖而非追加", () => {
    it(
      "document.cookie=data=1，GM_xhr cookie: data=2 时应只送出 data=2",
      async () => {
        setCookie("data", "1", ROOT);

        try {
          const response = await gmRequest({
            method: "GET",
            url: `${MOCKHTTP}/headers`,
            cookie: "data=2",
            timeout: 15000,
          });

          const cookieHeader = getCookieHeader(response);
          const cookieMap =
            parseCookieMultiMap(cookieHeader);

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
  });

  describe("TM #2829: 多个不同名 cookie 不应被截断", () => {
    it(
      'GM_xhr cookie: "data1=1; data2=2" 应两者都送出，而非只剩第一个',
      async () => {
        const response = await gmRequest({
          method: "GET",
          url: `${MOCKHTTP}/headers`,
          cookie: "data1=1; data2=2",
          timeout: 15000,
        });

        const cookieHeader = getCookieHeader(response);
        const cookieMap =
          parseCookieMultiMap(cookieHeader);

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
  });

  describe("完整矩阵：浏览器已有(0/1/2) × 脚本指定(0/1/2)", () => {
    it("发送带完整矩阵 cookie 参数的请求", async () => {
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
        url: `${MOCKHTTP}/headers`,
        cookie: customCookie,
        timeout: 15000,
      });

      const cookieHeader = getCookieHeader(response);

      lastCookieMap =
        parseCookieMultiMap(cookieHeader);

      expect(cookieHeader.length > 0).toBeTruthy();

      expect(lastCookieMap.size > 0).toBeTruthy();

      matrixOk = true;
    });

    it("m00：浏览器无、脚本未指定 → 不应出现", () => {
      if (!matrixOk) SCTest.skip("矩阵请求未通过，跳过依赖断言");
      assertCookieValues(lastCookieMap, "m00", []);
    });

    it("m01：浏览器无、脚本指定单值 → 应为脚本值", () => {
      if (!matrixOk) SCTest.skip("矩阵请求未通过，跳过依赖断言");
      assertCookieValues(
        lastCookieMap,
        "m01",
        ["new"]
      );
    });

    it("m02：浏览器无、脚本指定多值 → 应为脚本两个值", () => {
      if (!matrixOk) SCTest.skip("矩阵请求未通过，跳过依赖断言");
      assertCookieValues(lastCookieMap, "m02", [
        "new1",
        "new2",
      ]);
    });

    it("m10：浏览器单值、脚本未指定 → 应保留浏览器原值", () => {
      if (!matrixOk) SCTest.skip("矩阵请求未通过，跳过依赖断言");
      assertCookieValues(
        lastCookieMap,
        "m10",
        ["old"]
      );
    });

    it("m11：浏览器单值、脚本指定单值 → 应覆盖为脚本值", () => {
      if (!matrixOk) SCTest.skip("矩阵请求未通过，跳过依赖断言");
      assertCookieValues(
        lastCookieMap,
        "m11",
        ["new"]
      );
    });

    it("m12：浏览器单值、脚本指定多值 → 应覆盖为脚本两个值", () => {
      if (!matrixOk) SCTest.skip("矩阵请求未通过，跳过依赖断言");
      assertCookieValues(lastCookieMap, "m12", [
        "new1",
        "new2",
      ]);
    });

    it("m20：浏览器多值(同名不同path)、脚本未指定 → 应保留浏览器全部值", () => {
      if (!matrixOk) SCTest.skip("矩阵请求未通过，跳过依赖断言");
      assertCookieValues(lastCookieMap, "m20", [
        "old1",
        "old2",
      ]);
    });

    it("m21：浏览器多值、脚本指定单值 → 应完全覆盖为脚本单一值", () => {
      if (!matrixOk) SCTest.skip("矩阵请求未通过，跳过依赖断言");
      assertCookieValues(
        lastCookieMap,
        "m21",
        ["new"]
      );
    });

    it("m22：浏览器多值、脚本指定多值 → 应完全覆盖为脚本两个值", () => {
      if (!matrixOk) SCTest.skip("矩阵请求未通过，跳过依赖断言");
      assertCookieValues(lastCookieMap, "m22", [
        "new1",
        "new2",
      ]);
    });
  });

  try {
    await run();
  } finally {
    resetCookies();
  }
})();
