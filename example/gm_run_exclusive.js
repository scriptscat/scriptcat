// ==UserScript==
// @name         GM.runExclusive Demo
// @namespace    https://docs.scriptcat.org/
// @version      0.1.1
// @match        https://example.com/*?runExclusive*
// @grant        GM.runExclusive
// @grant        GM.setValue
// @grant        GM.getValue
// @run-at       document-start
// @allFrames
// ==/UserScript==

(async function () {
    'use strict';

    const delayMatch = location.href.match(/runExclusive(\d+)/);
    const timeDelay = delayMatch ? +delayMatch[1] : 0;
    const isWorker = !!timeDelay;

    /* ---------- Shared UI helpers ---------- */
    const panel = document.createElement('div');
    Object.assign(panel.style, {
        position: 'fixed',
        top: '10px',
        right: '10px',
        background: '#1e1e1e',
        color: '#e0e0e0',
        padding: '14px',
        borderRadius: '8px',
        fontFamily: 'monospace',
        zIndex: 99999,
        maxWidth: '420px'
    });
    document.documentElement.appendChild(panel);

    const logContainer = document.createElement('div');
    panel.appendChild(logContainer);

    const getTimeWithMilliseconds = date => `${date.toLocaleTimeString('it-US')}.${date.getMilliseconds()}`;

    const log = (msg, color = '#ccc') => {
        const line = document.createElement('div');
        line.textContent = `[${getTimeWithMilliseconds(new Date())}] ${msg}`;
        line.style.color = color;
        logContainer.appendChild(line);
    };

    /* ======================================================
       MAIN PAGE (Controller)
    ====================================================== */
    if (!isWorker) {
        panel.innerHTML = `
            <h3 style="margin-top:0">GM.runExclusive Demo</h3>
            <p>Pick worker durations (ms):</p>
            <input id="durations" value="1200,2400,3800"
                   style="width:100%;margin-bottom:8px">
            <button id="run">Run Demo</button>
            <button id="reset">Reset Counters</button>
            <hr>
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

            log(`Launching workers: ${delays.join(', ')}`, '#0f0');

            delays.forEach(delay => {
                const iframe = document.createElement('iframe');
                iframe.src = `${location.pathname}?runExclusive${delay}`;
                iframe.style.width = '100%';
                iframe.style.height = '220px';
                iframe.style.border = '1px solid #444';
                iframe.style.marginTop = '8px';
                iframeContainer.appendChild(iframe);
            });
        };

        window.addEventListener('message', (e) => {
            if (e.data?.type !== 'close-worker') return;
            const iframes = iframeContainer.querySelectorAll('iframe');
            for (const iframe of iframes) {
                if (iframe.src.includes(`runExclusive${e.data.delay}`)) {
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
    closeBtn.textContent = 'Close worker';
    Object.assign(closeBtn.style, {
        marginTop: '8px',
        padding: '4px 8px',
        cursor: 'pointer'
    });
    closeBtn.onclick = () => {
        window.parent.postMessage({ type: 'close-worker', delay: timeDelay }, '*');
    };
    panel.appendChild(closeBtn);

    log(`Worker ${timeDelay}ms loaded`, '#fff');
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
        }, 5000);
        log(`Result: ${JSON.stringify(result)}`, '#fff');
    } catch (e) {
        log(`Error: ${JSON.stringify(e?.message || e)}`, '#f55');
    }

    
})();
