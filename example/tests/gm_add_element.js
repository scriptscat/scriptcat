// ==UserScript==
// @name         GM_addElement test
// @match        *://*/*?test_GM_addElement
// @grant        GM_addElement
// @version      0
// ==/UserScript==

/*
### Example Sites
* https://content-security-policy.com/?test_GM_addElement (CSP)
* https://github.com/scriptscat/scriptcat/?test_GM_addElement (CSP)
* https://www.youtube.com/account_playback/?test_GM_addElement (TTP)
*/

const logSection = (title) => {
    console.log(`\n=== ${title} ===`);
};

const logStep = (message, data) => {
    if (data !== undefined) {
        console.log(`→ ${message}:`, data);
    } else {
        console.log(`→ ${message}`);
    }
};


// ─────────────────────────────────────────────
// Native textarea insertion
// ─────────────────────────────────────────────
logSection("Native textarea insertion - BEGIN");

const textarea = GM_addElement('textarea', {
    native: true,
    value: "myText",
});

logStep("Textarea value", textarea.value);
logSection("Native textarea insertion - END");


// ─────────────────────────────────────────────
// Div insertion
// ─────────────────────────────────────────────
logSection("Div insertion - BEGIN");

GM_addElement('div', {
    innerHTML: '<div id="test777"></div>',
});

logSection("Div insertion - END");


// ─────────────────────────────────────────────
// Span insertion
// ─────────────────────────────────────────────
logSection("Span insertion - BEGIN");

GM_addElement(document.getElementById("test777"), 'span', {
    className: "test777-span",
    textContent: 'Hello World!',
});

logStep(
    "Span content",
    document.querySelector("span.test777-span").textContent
);

logSection("Span insertion - END");


// ─────────────────────────────────────────────
// Image insertion
// ─────────────────────────────────────────────
logSection("Image insertion - BEGIN");

let img;
await new Promise((resolve, reject) => {
    img = GM_addElement(document.body, 'img', {
        src: 'https://www.tampermonkey.net/favicon.ico',
        onload: resolve,
        onerror: reject
    });

    logStep("Image element inserted");
});

logStep("Image loaded");
logSection("Image insertion - END");


// ─────────────────────────────────────────────
// Script insertion
// ─────────────────────────────────────────────
logSection("Script insertion - BEGIN");

GM_addElement(document.body, 'script', {
    textContent: "window.myCustomFlag = true; console.log('script run ok');",
}, img);

logStep(
    "Script inserted before image",
    img.previousSibling?.nodeName === "SCRIPT"
);

logSection("Script insertion - END");
