// ==UserScript==
// @name         GM_registerMenuCommand Example
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Simple demo for GM_registerMenuCommand
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(async function () {
  'use strict';

  const checkSubFrameIdSequence = false;

  const intervalChanging = false;

  const skipClickCheck = false;

  let myResolve = () => { };
  const waitNext = async () => {
    await new Promise((resolve) => {
      myResolve = () => { setTimeout(resolve, 50) };
    });
  };

  const waitActions = async (...messages) => {
    if (skipClickCheck) return;
    messages = messages.flat();
    for (const message of messages) {
      console.log(message);
      await waitNext();
    }
  };

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

  let obj1 = { id: "abc" };

  const r01 = GM_registerMenuCommand("MenuReg abc-1", () => {

    console.log("abc-1");
    myResolve();
  }, obj1);

  const r02 = GM_registerMenuCommand("MenuReg abc-2", () => {

    console.log("abc-2");
    myResolve();
  }, obj1);

  console.log("abc-1 id === abc", r01 === "abc");
  console.log("abc-2 id === abc", r02 === "abc");

  // there shall be only "MenuReg abc-2" in the menu.
  await waitActions("There shall be only 'MenuReg abc-2'. Click it to continue.");

  GM_registerMenuCommand("MenuReg abc-1", () => {

    console.log("abc-1.abd");
    myResolve();
  }, { id: "abd" });

  GM_registerMenuCommand("MenuReg abc-2", () => {

    console.log("abc-2.abe");
    myResolve();
  }, { id: "abe" });


  // there shall be only "MenuReg abc-1" and "MenuReg abc-2" in the menu.
  await waitActions("There shall be 'MenuReg abc-2' and 'MenuReg abc-1'. Click either them to continue.");


  GM_registerMenuCommand("MenuReg abc-2", () => {

    console.log("abc-2.abf");
    myResolve();
  }, { id: "abf", accessKey: "h" });

  // there shall be only "MenuReg abc-1" and "MenuReg abc-2" in the menu.
  await waitActions("There shall be 'MenuReg abc-2', 'MenuReg abc-1' and 'MenuReg abc-2 (H)'. Click either them to continue.");

  GM_unregisterMenuCommand("abc");
  GM_unregisterMenuCommand("abd");
  GM_unregisterMenuCommand("abe");
  GM_unregisterMenuCommand("abf");



  const p10 = GM_registerMenuCommand("MenuReg D-23", () => {

    console.log(110);
    myResolve();
  }, "b");


  const p20 = GM_registerMenuCommand("MenuReg D-23", () => {

    console.log(120);
    myResolve();
  }, "b");

  console.log("p10 === 1", p10 === 1);
  console.log("p20 === 2", p20 === 2);

  // MenuReg D-23 clicking shall give both 110 and 120
  await waitActions("Click [MenuReg D-23] -> 110, 120");


  const p30 = GM_registerMenuCommand("MenuReg D-26", () => {

    console.log(130);
    myResolve();
  }, { id: "2" });
  console.log("p30 === '2'", p30 === "2");

  // MenuReg D-23 clicking shall give 110
  // MenuReg D-26 clicking shall give 130

  await waitActions("Click [MenuReg D-23] -> 110", "Click [MenuReg D-26] -> 130");


  const p32 = GM_registerMenuCommand("MenuReg D-26", () => {

    console.log(210);
    myResolve();
  }, { id: 2 });
  console.log("p32 === 2", p32 === 2);

  // MenuReg D-23 clicking shall give 110
  // MenuReg D-26 clicking shall give 210

  await waitActions("Click [MenuReg D-23] -> 110", "Click [MenuReg D-26] -> 210");


  const p33 = GM_registerMenuCommand("MenuReg D-26", () => {

    console.log(220);
    myResolve();
  }, { id: 3 });
  console.log("p33 === 3", p33 === 3);

  // MenuReg D-23 clicking shall give 110
  // MenuReg D-26 clicking shall give 210 220

  await waitActions("Click [MenuReg D-23] -> 110", "Click [MenuReg D-26] -> 210, 220");



  const p34 = GM_registerMenuCommand("MenuReg D-26", () => {

    console.log(230);
    myResolve();
  }, { id: "4" });
  console.log("p34 === '4'", p34 === "4");

  // MenuReg D-23 clicking shall give 110
  // MenuReg D-26 clicking shall give 210 220 230
  await waitActions("Click [MenuReg D-23] -> 110", "Click [MenuReg D-26] -> 210, 220, 230");

  GM_unregisterMenuCommand("4");


  // MenuReg D-23 clicking shall give 110
  // MenuReg D-26 clicking shall give 210 220
  await waitActions("Click [MenuReg D-23] -> 110", "Click [MenuReg D-26] -> 210, 220");



  const p40 = GM_registerMenuCommand("MenuReg D-40", () => {

    console.log(601);
  });

  const p50 = GM_registerMenuCommand("MenuReg D-50", () => {

    console.log(602);
  });
  console.log("p40, p50", [p40, p50]); // TM gives 3&4



})().finally(() => {
  console.log("finish");
});

