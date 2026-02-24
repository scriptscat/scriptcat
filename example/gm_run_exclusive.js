// ==UserScript==
// @name         GM.runExclusive Demo
// @namespace    https://docs.scriptcat.org/
// @version      0.1.2
// @match        https://example.com/*?runExclusive*
// @grant        GM.runExclusive
// @grant        GM.setValue
// @grant        GM.getValue
// @run-at       document-start
// @allFrames
// ==/UserScript==

(async function () {
    'use strict';

    const delayMatch = location.href.match(/runExclusive(\d+)_(\d*)/);
    const timeDelay = delayMatch ? +delayMatch[1] : 0;
    const timeoutValue = (delayMatch ? +delayMatch[2] : 0) || -1;
    const isWorker = !!timeDelay;

    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
        #exclusive-test-panel {
            all: unset;
        }
        #exclusive-test-panel div, #exclusive-test-panel p, #exclusive-test-panel span {
            opacity: 1.0;
            line-height: 1;
            font-size: 10pt;
        }
    `);
    document.adoptedStyleSheets = document.adoptedStyleSheets.concat(sheet);

    /* ---------- Shared UI helpers ---------- */
    const panel = document.createElement('div');
    panel.id = "exclusive-test-panel";
    Object.assign(panel.style, {
        opacity: "1.0",
        position: 'fixed',
        boxSizing: 'border-box',
        top: '10px',
        right: '10px',
        background: '#3e3e3e',
        color: '#e0e0e0',
        padding: '14px',
        borderRadius: '8px',
        fontFamily: 'monospace',
        zIndex: 99999,
        width: '420px'
    });
    document.documentElement.appendChild(panel);

    const logContainer = document.createElement('div');
    panel.appendChild(logContainer);

    const getTimeWithMilliseconds = date => `${date.toLocaleTimeString('it-US')}.${date.getMilliseconds()}`;

    const log = (msg, color = '#ccc') => {
        const line = document.createElement('div');
        line.textContent = msg.startsWith(" ") ? msg : `[${getTimeWithMilliseconds(new Date())}] ${msg}`;
        line.style.color = color;
        logContainer.appendChild(line);
    };

    /* ======================================================
       MAIN PAGE (Controller)
    ====================================================== */
    if (!isWorker) {
        panel.style.width = "480px";
        panel.innerHTML = `
            <h3 style="margin-top:0">GM.runExclusive Demo</h3>
            <p>Pick worker durations (ms):</p>
            <div style="display:flex; flex-direction:row; gap: 4px;">
                <input id="durations" value="1200,2400,3800,400"
                   style="width:140px; margin: 0;" />
                <input id="timeout" value="5000"
                   style="width:45px; margin: 0;" />
                <button id="run">Run Demo</button>
                <button id="reset">Reset Counters</button>
            </div>
            <div id="iframeContainer"></div>
        `;

        const iframeContainer = panel.querySelector('#iframeContainer');

        panel.querySelector('#reset').onclick = async () => {
            await GM.setValue('mValue01', 0);
            await GM.setValue('order', 0);
            iframeContainer.innerHTML = '';
            log('Shared counters reset', '#ff0');
        };

        panel.querySelector('#run').onclick = async () => {
            iframeContainer.innerHTML = '';
            await GM.setValue('mValue01', 0);
            await GM.setValue('order', 0);

            const delays = panel
                .querySelector('#durations')
                .value.split(',')
                .map(v => +v.trim())
                .filter(Boolean);
            
            let timeoutQ = +panel.querySelector("#timeout").value.trim() || "";

            log(`Launching workers: ${delays.join(', ')}`, '#0f0');

            delays.forEach(delay => {
                const iframe = document.createElement('iframe');
                iframe.src = `${location.pathname}?runExclusive${delay}_${timeoutQ}`;
                iframe.style.width = '100%';
                iframe.style.height = '160px';
                iframe.style.border = '1px solid #444';
                iframe.style.marginTop = '8px';
                iframeContainer.appendChild(iframe);
            });
        };

        window.addEventListener('message', (e) => {
            if (e.data?.type !== 'close-worker') return;
            const iframes = iframeContainer.querySelectorAll('iframe');
            for (const iframe of iframes) {
                if (iframe.src.includes(`runExclusive${e.data.delay}_`)) {
                    iframe.remove();
                    log(`Closed worker ${e.data.delay}ms`, '#ff9800');
                    return;
                }
            }
        });

        return;
    }

    /* ======================================================
       WORKER IFRAME
    ====================================================== */

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    Object.assign(closeBtn.style, {
        margin: '8px',
        padding: '4px 8px',
        cursor: 'pointer',
        position: 'absolute',
        top: '0px',
        right: '0px',
        boxSizing: 'border-box'
    });
    closeBtn.onclick = () => {
        window.parent.postMessage({ type: 'close-worker', delay: timeDelay }, '*');
    };
    panel.appendChild(closeBtn);

    log(` [Worker] duration=${timeDelay}ms${timeoutValue > 0 ? " timeout=" + timeoutValue + "ms" : ""}`, '#fff');
    log('Waiting for exclusive lock…', '#0af');

    const startWait = performance.now();

    try {
        const result = await GM.runExclusive('demo-lock-key', async () => {
            const waited = Math.round(performance.now() - startWait);

            const order = (await GM.getValue('order')) + 1;
            await GM.setValue('order', order);

            log(`Lock acquired (#${order}, waited ${waited}ms)`, '#0f0');

            const val = await GM.getValue('mValue01');
            await GM.setValue('mValue01', val + timeDelay);

            log(`Working ${timeDelay}ms…`, '#ff0');
            await new Promise(r => setTimeout(r, timeDelay));

            const final = await GM.getValue('mValue01');
            log(`Done. Shared value = ${final}`, '#f55');

            return { order, waited, final };
        }, timeoutValue);
        log(`Result: ${JSON.stringify(result)}`, '#fff');
    } catch (e) {
        log(`Error: ${JSON.stringify(e?.message || e)}`, '#f55');
    }

    
})();
