// ==UserScript==
// @name         GM_registerMenuCommand Example
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Simple demo for GM_registerMenuCommand
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @require      https://cdn.jsdelivr.net/gh/scriptscat/scriptcat@main/example/tests/lib/sctest.js
// ==/UserScript==

(async function () {
  'use strict';

  const checkSubFrameIdSequence = false;

  const intervalChanging = false;

  const skipClickCheck = false;

  const isInSubFrame = () => {

    try {
      return window.top !== window;
    } catch {
      return true;
    }
  }

  if (intervalChanging) {
    // TM: 在打开菜单时，显示会不断改变
    let i = 1000;
    let p = 0;
    setInterval(() => {
      if (p) GM_unregisterMenuCommand(p);
      i++;
      GM_registerMenuCommand(`interval-m-${i}`, () => { console.log(`${i}`); }, {id: "m"});
      p = GM_registerMenuCommand(`interval-n-${i}`, () => { console.log(`${i}`); });
    }, 1000);
    // return;
  }
  if (checkSubFrameIdSequence) {
    const key = Math.floor(Math.random() * 99999 + 99999).toString();

    let arr = [];
    arr.push(
      GM_registerMenuCommand("test", () => { console.log(`${key}-1`); }),
      GM_registerMenuCommand("test", () => { console.log(`${key}-2`); }),
      GM_registerMenuCommand("test", () => { console.log(`${key}-3`); })
    );
    if (isInSubFrame()) {
      arr.push(GM_registerMenuCommand("test-sub", () => { console.log(`${key}-sub`); }));
    } else {
      arr.push(GM_registerMenuCommand("test-main", () => { console.log(`${key}-main`); }));
    }
    arr.push(GM_registerMenuCommand(`test-${location.origin}`, () => { console.log(`${key}-origin`); }));
    console.log(`checkSubFrameIdSequence (key=${key}, frame=${isInSubFrame()})`, arr.join("..."));
    // return;
  }

  const { describe, it, itManual, expect, run } = SCTest.create({ name: "GM_registerMenuCommand 测试" });

  // skipClickCheck 沿用原义：跑注册逻辑与返回值断言，但跳过需要人点菜单的核对项。
  const manual = skipClickCheck ? () => {} : itManual;

  describe("菜单 id 契约与交互", () => {
    let r01, r02, p10, p20, p30, p32, p33, p34, p40, p50;
    const obj1 = { id: "abc" };

    it("同一 obj id 的两次注册都返回 'abc'", () => {
      r01 = GM_registerMenuCommand("MenuReg abc-1", () => { console.log("abc-1"); }, obj1);
      r02 = GM_registerMenuCommand("MenuReg abc-2", () => { console.log("abc-2"); }, obj1);
      expect(r01).toBe("abc");
      expect(r02).toBe("abc");
    });

    manual("菜单里应只有 'MenuReg abc-2'", {
      hint: "abc-1 与 abc-2 复用同一个 {id:'abc'}，后者覆盖前者；打开扩展图标 → 本脚本菜单分组，应只见 MenuReg abc-2，点击它输出 abc-2",
    });

    it("用新 id abd/abe 重新注册 abc-1/abc-2", () => {
      GM_registerMenuCommand("MenuReg abc-1", () => { console.log("abc-1.abd"); }, { id: "abd" });
      GM_registerMenuCommand("MenuReg abc-2", () => { console.log("abc-2.abe"); }, { id: "abe" });
    });

    manual("菜单里应有 'MenuReg abc-2' 和 'MenuReg abc-1'", {
      hint: "abd 重注册 abc-1、abe 重注册 abc-2；两项都应出现，点击分别输出 abc-1.abd 与 abc-2.abe",
    });

    it("再用 abf + accessKey h 注册 abc-2", () => {
      GM_registerMenuCommand("MenuReg abc-2", () => { console.log("abc-2.abf"); }, { id: "abf", accessKey: "h" });
    });

    manual("菜单里应有 abc-2、abc-1 和 abc-2 (H)", {
      hint: "abf 带 accessKey h，显示为带 (H) 的第三项，点击输出 abc-2.abf",
    });

    it("注销 abc/abd/abe/abf", () => {
      GM_unregisterMenuCommand("abc");
      GM_unregisterMenuCommand("abd");
      GM_unregisterMenuCommand("abe");
      GM_unregisterMenuCommand("abf");
    });

    it("字符串第三参注册两次返回自增整数 1、2", () => {
      p10 = GM_registerMenuCommand("MenuReg D-23", () => { console.log(110); }, "b");
      p20 = GM_registerMenuCommand("MenuReg D-23", () => { console.log(120); }, "b");
      expect(p10).toBe(1);
      expect(p20).toBe(2);
    });

    manual("点击 [MenuReg D-23] 应先后输出 110、120", {
      hint: "第三参是字符串 'b'(accessKey)，两次注册不合并；点该项看控制台",
    });

    it("对象 id '2' 注册返回 '2'", () => {
      p30 = GM_registerMenuCommand("MenuReg D-26", () => { console.log(130); }, { id: "2" });
      expect(p30).toBe("2");
    });

    manual("[MenuReg D-23]→110，[MenuReg D-26]→130", {
      hint: "分别点击两项核对控制台输出",
    });

    it("数字 id 2 注册返回 2", () => {
      p32 = GM_registerMenuCommand("MenuReg D-26", () => { console.log(210); }, { id: 2 });
      expect(p32).toBe(2);
    });

    manual("[MenuReg D-23]→110，[MenuReg D-26]→210", {
      hint: "id 2 与 '2' 视为同一项，210 覆盖 130；分别点击两项核对",
    });

    it("数字 id 3 注册返回 3", () => {
      p33 = GM_registerMenuCommand("MenuReg D-26", () => { console.log(220); }, { id: 3 });
      expect(p33).toBe(3);
    });

    manual("[MenuReg D-23]→110，[MenuReg D-26]→210、220", {
      hint: "id 3 是另一项，D-26 现有两个条目；分别点击核对",
    });

    it("字符串 id '4' 注册返回 '4'", () => {
      p34 = GM_registerMenuCommand("MenuReg D-26", () => { console.log(230); }, { id: "4" });
      expect(p34).toBe("4");
    });

    manual("[MenuReg D-23]→110，[MenuReg D-26]→210、220、230", {
      hint: "id '4' 再加一项，D-26 现有三个条目；分别点击核对",
    });

    it("注销 id '4'", () => {
      GM_unregisterMenuCommand("4");
    });

    manual("[MenuReg D-23]→110，[MenuReg D-26]→210、220", {
      hint: "id '4' 已注销，输出 230 的那项应消失",
    });

    it("无第三参注册返回自增整数（不断言具体值）", () => {
      p40 = GM_registerMenuCommand("MenuReg D-40", () => { console.log(601); });
      p50 = GM_registerMenuCommand("MenuReg D-50", () => { console.log(602); });
      console.log("p40, p50", [p40, p50]); // TM gives 3&4
    });
  });

  await run();
})().finally(() => {
  console.log("finish");
});
