// ==UserScript==
// @name         A Scriptlet for @unwrap test
// @namespace    none
// @version      2026-02-07
// @description  try to take over the world!
// @author       You
// @match        https://*/*?test_unwrap*
// @exclude      /test_\w+_excluded/
// @grant        GM_setValue
// @require      https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js#sha384-vtXRMe3mGCbOeY7l30aIg8H9p3GdeSe4IFlP6G8JMa7o7lXvnz3GFKzPxzJdPfGK
// @unwrap
// ==/UserScript==

// include: https://example.com/?test_unwrap_123
// exclude: https://example.com/?test_unwrap_excluded

var test_global_injection = "success"; 
// User can access the variable "test_global_injection" directly in DevTools

(function () {
    const results = {
        GM: {
            expected: "undefined",
            actual: typeof GM,
        },
        GM_setValue: {
            expected: "undefined",
            actual: typeof GM_setValue,
        },
        jQuery: {
            expected: "function",
            actual: typeof jQuery,
        },
    };

    console.group(
        "%c@unwrap Test",
        "color:#0aa;font-weight:bold"
    );

    const table = {};
    let allPass = true;

    for (const key in results) {
        const { expected, actual } = results[key];
        const pass = expected === actual;
        allPass &&= pass;

        table[key] = {
            Expected: expected,
            Actual: actual,
            Result: pass ? "✅ PASS" : "❌ FAIL",
        };
    }

    console.table(table);

    console.log(
        allPass
            ? "%cAll tests passed ✔"
            : "%cSome tests failed ✘",
        `font-weight:bold;color:${allPass ? "green" : "red"}`
    );

    console.groupEnd();
})();
