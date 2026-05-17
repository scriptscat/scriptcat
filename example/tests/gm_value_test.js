// ==UserScript==
// @name         GM_addValueChangeListener Test
// @namespace    http://tampermonkey.net/
// @version      0.1.0
// @description  Test GM_addValueChangeListener with real iframes — dashboard in main, panels in iframes
// @match        https://example.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (!location.search.includes('testGMAddValueChangeListener')) return;

  document.documentElement.appendChild(document.createElement("style")).textContent=`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700,800&display=swap');`;

  /* ══════════════════════════════════════════════════════════
     SHARED CONSTANTS
  ══════════════════════════════════════════════════════════ */
  const FRAME_IDS = ['main', 'iframe1', 'iframe2', 'iframe3'];

  const WRITE_KEY = {
    main: 'key_from_main',
    iframe1: 'key_from_iframe1',
    iframe2: 'key_from_iframe2',
    iframe3: 'key_from_iframe3',
  };
  const ALL_KEYS = Object.values(WRITE_KEY);

  const ACCENT = {
    main: '#0369a1',
    iframe1: '#b91c1c',
    iframe2: '#15803d',
    iframe3: '#a16207',
  };

  const LABEL = {
    main: '🖥  Main Frame',
    iframe1: '📦  iFrame #1',
    iframe2: '📦  iFrame #2',
    iframe3: '📦  iFrame #3',
  };

  /* ══════════════════════════════════════════════════════════
     CONTEXT DETECTION
  ══════════════════════════════════════════════════════════ */
  const isMain = window.self === window.top;
  const frameId = new URLSearchParams(location.search).get('frameId')
    || (isMain ? 'main' : 'unknown');

  /* ══════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════ */
  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function fmtVal(v) {
    return v === undefined
      ? '<i style="color:#94a3b8">not set</i>'
      : escHtml(JSON.stringify(v));
  }

  function nowTime() {
    return new Date().toLocaleTimeString('en-GB', { hour12: false });
  }

  /* ══════════════════════════════════════════════════════════
     MSG BUS
  ══════════════════════════════════════════════════════════ */
  const MSG_NS = 'GMTEST_';
  const TARGET_ORIGIN = location.origin;

  function reportLog(entry) {
    top.postMessage({ t: MSG_NS + 'LOG', frameId, entry }, TARGET_ORIGIN);
  }

  function reportKV(kvMap) {
    top.postMessage({ t: MSG_NS + 'KV', frameId, kvMap }, TARGET_ORIGIN);
  }

  function reportReady() {
    top.postMessage({ t: MSG_NS + 'READY', frameId }, TARGET_ORIGIN);
  }

  function reportListeners(ids) {
    top.postMessage({ t: MSG_NS + 'LISTENERS', frameId, ids }, TARGET_ORIGIN);
  }

  function sendCmd(win, cmd, data = {}) {
    win.postMessage({ t: MSG_NS + 'CMD', cmd, ...data }, TARGET_ORIGIN);
  }

  /* ══════════════════════════════════════════════════════════
     IFRAME FRAME LOGIC
  ══════════════════════════════════════════════════════════ */
  if (!isMain) {
    const myKey = WRITE_KEY[frameId];
    if (!myKey) return;

    let iframeShadow = null;

    buildIframeBody();

    const listenerIds = {};
    registerAllListeners();

    pushKV();
    reportReady();

    window.addEventListener('message', async (e) => {
      if (e.origin !== location.origin) return;
      if (!e.data || !e.data.t) return;
      if (e.data.t !== MSG_NS + 'CMD') return;

      const { cmd, value } = e.data;

      if (cmd === 'SET_STRING') await doSet(`hello_${Date.now()}`);
      if (cmd === 'SET_NUMBER') await doSet(Math.floor(Math.random() * 99999));
      if (cmd === 'SET_OBJECT') await doSet({ ts: Date.now(), from: frameId });
      if (cmd === 'SET_NULL') await doSet(null);
      if (cmd === 'SET_CUSTOM') await doSet(value);
      if (cmd === 'DELETE') await doDel();

      if (cmd === 'REMOVE_LISTENERS') {
        removeAllListeners();
      }

      if (cmd === 'REREGISTER_LISTENERS') {
        removeAllListeners();
        registerAllListeners();
      }
    });

    async function doSet(v) {
      await GM_setValue(myKey, v);
      iLog(`✏️ Set <b>${escHtml(myKey)}</b> = <b>${escHtml(JSON.stringify(v))}</b>`, 'info');
      await pushKV();
    }

    async function doDel() {
      await GM_deleteValue(myKey);
      iLog(`🗑 Deleted <b>${escHtml(myKey)}</b>`, 'warn');
      await pushKV();
    }

    function registerAllListeners() {
      for (const key of ALL_KEYS) {
        if (listenerIds[key] != null) continue;

        const id = GM_addValueChangeListener(key, async (name, oldVal, newVal, remote) => {
          const tag = remote ? '🌐 remote' : '📍 local';

          iLog(
            `${tag} <b>${escHtml(name)}</b>: ${escHtml(JSON.stringify(oldVal))} → <b>${escHtml(JSON.stringify(newVal))}</b>`,
            remote ? 'good' : 'warn'
          );

          await pushKV();
        });

        listenerIds[key] = id;
        iLog(`👂 Listener on <b>${escHtml(key)}</b> <small>(id=${escHtml(id)})</small>`, 'info');
      }

      reportListeners(Object.entries(listenerIds).map(([k, id]) => ({ key: k, id })));
    }

    function removeAllListeners() {
      for (const [key, id] of Object.entries(listenerIds)) {
        try {
          GM_removeValueChangeListener(id);
        } catch (_) { }
        delete listenerIds[key];
      }

      iLog('🔇 All listeners removed', 'warn');
      reportListeners([]);
    }

    async function pushKV() {
      const kvMap = {};
      for (const k of ALL_KEYS) {
        kvMap[k] = await GM_getValue(k, undefined); // iframe
      }
      reportKV(kvMap);
    }

    function iLog(msg, type = '') {
      reportLog({ msg, type, t: nowTime() });

      if (!iframeShadow) return;

      const logBox = iframeShadow.getElementById('iframe-log');
      if (!logBox) return;

      const line = document.createElement('div');
      line.className = 'log-line';
      line.innerHTML = `
        <span class="log-time">${escHtml(nowTime())}</span>
        <span class="log-msg ${escHtml(type)}">${msg}</span>
      `;

      logBox.appendChild(line);
      logBox.scrollTop = logBox.scrollHeight;
    }

    function buildIframeBody() {
      const accent = ACCENT[frameId] || '#334155';

      document.documentElement.style.cssText = `
        margin:0;
        padding:0;
        width:100%;
        height:100%;
        background:#f8fafc;
      `;

      document.body.style.cssText = `
        margin:0;
        padding:0;
        width:100%;
        height:100%;
        background:#f8fafc;
        overflow:hidden;
      `;

      document.body.textContent = '';

      const host = document.createElement('div');
      host.style.cssText = `
        all:initial;
        display:block;
        width:100%;
        height:100%;
      `;
      document.body.appendChild(host);

      iframeShadow = host.attachShadow({ mode: 'open' });

      const sty = new CSSStyleSheet();
      sty.replaceSync(`

        *, *::before, *::after {
          all:unset;
          box-sizing:border-box;
        }

        #iframe-shell {
          display:flex;
          flex-direction:column;
          gap:6px;
          width:100%;
          height:100%;
          padding:8px;
          overflow:hidden;
          background:#f8fafc;
          color:#0f172a;
          font-family:'JetBrains Mono','Courier New',monospace;
          font-size:12px;
        }

        .iframe-title {
          display:block;
          color:${accent};
          font-family:'JetBrains Mono',monospace;
          font-size:13px;
          font-weight:800;
          letter-spacing:.05em;
          flex-shrink:0;
        }

        .iframe-subtitle {
          display:block;
          color:#475569;
          font-size:10px;
          letter-spacing:.08em;
          flex-shrink:0;
        }

        .log-box {
          display:block;
          flex:1;
          min-height:0;
          overflow-y:auto;
          background:#ffffff;
          border:1px solid #cbd5e1;
          border-radius:7px;
          padding:6px 8px;
          font-size:11px;
          line-height:1.65;
          scrollbar-width:thin;
          scrollbar-color:#94a3b8 transparent;
          box-shadow:0 1px 2px rgba(15,23,42,.08);
        }

        .log-box::-webkit-scrollbar {
          width:5px;
        }

        .log-box::-webkit-scrollbar-thumb {
          background:#94a3b8;
          border-radius:999px;
        }

        .log-line {
          display:flex;
          gap:6px;
          align-items:baseline;
        }

        .log-time {
          color:#64748b;
          flex-shrink:0;
        }

        .log-msg {
          color:#334155;
        }

        .log-msg.good {
          color:#15803d;
          font-weight:700;
        }

        .log-msg.warn {
          color:#a16207;
          font-weight:700;
        }

        .log-msg.info {
          color:#0369a1;
          font-weight:700;
        }

        b {
          font-weight:700;
        }

        i {
          font-style:italic;
        }

        small {
          font-size:.85em;
          opacity:.75;
        }
      `);

      // スタイルシートを適用
      iframeShadow.adoptedStyleSheets = [sty];


      const shell = document.createElement('div');
      shell.id = 'iframe-shell';
      shell.innerHTML = `
        <div class="iframe-title">${escHtml(LABEL[frameId])}</div>
        <div class="iframe-subtitle">Controlled by main frame dashboard ↑</div>
        <div id="iframe-log" class="log-box"></div>
      `;

      iframeShadow.appendChild(shell);
    }

    return;
  }

  /* ══════════════════════════════════════════════════════════
     MAIN FRAME LOGIC
  ══════════════════════════════════════════════════════════ */
  const state = {
    kv: {},
    logs: {},
    listenerSummary: {},
  };

  FRAME_IDS.forEach(id => {
    state.kv[id] = {};
    state.logs[id] = [];
    state.listenerSummary[id] = [];
  });

  const iframeWindows = {};

  /* ── Shadow DOM setup ─────────────────────────────────── */
  const host = document.createElement('div');
  host.style.cssText = [
    'all:initial',
    'position:fixed',
    'inset:0',
    'width:100vw',
    'height:100vh',
    'z-index:2147483647',
    'pointer-events:none',
  ].join(';');

  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  /* ── Styles ─────────────────────────────────────────────── */
  const sty = new CSSStyleSheet();
  sty.replaceSync(`

    *, *::before, *::after {
      all:unset;
      box-sizing:border-box;
    }

    #shell {
      display:grid;
      position:fixed;
      inset:0;
      width:100vw;
      height:100vh;
      grid-template-columns:1fr 340px;
      grid-template-rows:100vh;
      overflow:hidden;
      pointer-events:all;
      background:#f1f5f9;
      color:#0f172a;
      font-family:'JetBrains Mono','Courier New',monospace;
      font-size:12px;
    }

    #dashboard {
      display:flex;
      flex-direction:column;
      overflow-y:auto;
      overflow-x:hidden;
      padding:16px;
      gap:12px;
      background:#f8fafc;
      border-right:1px solid #cbd5e1;
      scrollbar-width:thin;
      scrollbar-color:#94a3b8 transparent;
    }

    #dashboard::-webkit-scrollbar {
      width:6px;
    }

    #dashboard::-webkit-scrollbar-thumb {
      background:#94a3b8;
      border-radius:999px;
    }

    #iframe-strip {
      display:flex;
      flex-direction:column;
      overflow:hidden;
      background:#e2e8f0;
    }

    .iframe-wrap {
      display:flex;
      flex:1;
      flex-direction:column;
      border-bottom:1px solid #cbd5e1;
      overflow:hidden;
      background:#f8fafc;
    }

    .iframe-wrap:last-child {
      border-bottom:none;
    }

    .iframe-wrap iframe {
      display:block;
      flex:1;
      width:100%;
      height:100%;
      border:none;
      background:#f8fafc;
    }

    #topbar {
      display:flex;
      align-items:center;
      gap:10px;
      flex-shrink:0;
      background:#ffffff;
      border:1px solid #cbd5e1;
      border-radius:10px;
      padding:10px 12px;
      box-shadow:0 1px 3px rgba(15,23,42,.08);
    }

    #topbar-title {
      font-family:'JetBrains Mono',monospace;
      font-size:15px;
      font-weight:800;
      color:#0f172a;
      letter-spacing:.08em;
      flex:1;
    }

    button {
      display:inline-block;
      font-family:'JetBrains Mono','Courier New',monospace;
      font-size:11px;
      font-weight:700;
      padding:5px 10px;
      border-radius:6px;
      border:1px solid;
      cursor:pointer;
      letter-spacing:.03em;
      transition:background .12s, opacity .12s, transform .08s;
      white-space:nowrap;
      pointer-events:all;
      background:#ffffff;
    }

    button:hover {
      opacity:.85;
      transform:translateY(-1px);
    }

    button:active {
      opacity:.7;
      transform:translateY(0);
    }

    button.danger {
      color:#991b1b !important;
      border-color:#fecaca !important;
      background:#fff1f2 !important;
    }

    .p-card {
      display:block;
      border:1px solid #cbd5e1;
      border-radius:12px;
      padding:12px;
      background:#ffffff;
      flex-shrink:0;
      box-shadow:0 1px 3px rgba(15,23,42,.08);
    }

    .p-title {
      display:block;
      font-family:'JetBrains Mono',monospace;
      font-size:14px;
      font-weight:800;
      letter-spacing:.05em;
      margin-bottom:4px;
    }

    .p-subtitle {
      display:block;
      font-size:10px;
      color:#475569;
      letter-spacing:.08em;
      margin-bottom:10px;
    }

    .sec {
      display:block;
      margin-top:9px;
    }

    .sec-label {
      display:block;
      font-size:10px;
      font-weight:700;
      letter-spacing:.14em;
      text-transform:uppercase;
      color:#475569;
      margin-bottom:5px;
    }

    .hr {
      display:block;
      height:1px;
      background:#e2e8f0;
      margin:10px 0;
    }

    .btn-row {
      display:flex;
      flex-wrap:wrap;
      gap:5px;
    }

    .kv-table {
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:5px;
    }

    .kv-card {
      display:block;
      background:#f8fafc;
      border:1px solid #cbd5e1;
      border-radius:7px;
      padding:6px 8px;
    }

    .kv-key {
      display:block;
      font-size:10px;
      font-weight:700;
      color:#475569;
      margin-bottom:2px;
    }

    .kv-val {
      display:block;
      font-size:11px;
      color:#0f172a;
      word-break:break-all;
      line-height:1.4;
    }

    .log-box {
      display:block;
      height:118px;
      overflow-y:auto;
      background:#ffffff;
      border:1px solid #cbd5e1;
      border-radius:7px;
      padding:6px 8px;
      font-size:11px;
      line-height:1.65;
      scrollbar-width:thin;
      scrollbar-color:#94a3b8 transparent;
    }

    .log-box::-webkit-scrollbar {
      width:5px;
    }

    .log-box::-webkit-scrollbar-thumb {
      background:#94a3b8;
      border-radius:999px;
    }

    .log-line {
      display:flex;
      gap:6px;
      align-items:baseline;
    }

    .log-time {
      color:#64748b;
      flex-shrink:0;
    }

    .log-msg {
      color:#334155;
    }

    .log-msg.good {
      color:#15803d;
      font-weight:700;
    }

    .log-msg.warn {
      color:#a16207;
      font-weight:700;
    }

    .log-msg.info {
      color:#0369a1;
      font-weight:700;
    }

    .dot {
      display:inline-block;
      width:7px;
      height:7px;
      border-radius:50%;
      background:#cbd5e1;
      vertical-align:middle;
      border:1px solid #94a3b8;
    }

    .dot.on {
      background:#16a34a;
      border-color:#15803d;
      box-shadow:0 0 0 3px rgba(22,163,74,.16);
    }

    b {
      font-weight:700;
    }

    i {
      font-style:italic;
    }

    small {
      font-size:.85em;
      opacity:.75;
    }
  `);
  // スタイルシートを適用
  shadow.adoptedStyleSheets = [sty];

  /* ── Shell ─────────────────────────────────────────────── */
  const shell = document.createElement('div');
  shell.id = 'shell';
  shadow.appendChild(shell);

  /* ── Left dashboard ─────────────────────────────────────── */
  const dashboard = document.createElement('div');
  dashboard.id = 'dashboard';
  shell.appendChild(dashboard);

  const topbar = document.createElement('div');
  topbar.id = 'topbar';
  topbar.innerHTML = `<span id="topbar-title">⚙ GM_addValueChangeListener Test</span>`;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'danger';
  closeBtn.textContent = '✕ close';
  closeBtn.onclick = () => host.remove();
  topbar.appendChild(closeBtn);
  dashboard.appendChild(topbar);

  /* ── Panel cards ───────────────────────────────────────── */
  const panelRefs = {};

  FRAME_IDS.forEach(id => {
    const accent = ACCENT[id];

    const card = document.createElement('div');
    card.className = 'p-card';
    card.style.borderColor = accent + '55';

    const title = document.createElement('div');
    title.className = 'p-title';
    title.style.color = accent;
    title.textContent = LABEL[id];
    card.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.className = 'p-subtitle';
    subtitle.textContent = id === 'main'
      ? 'runs in this window'
      : 'runs in real iframe on the right →';
    card.appendChild(subtitle);

    const wLabel = document.createElement('div');
    wLabel.className = 'sec-label';
    wLabel.textContent = 'Write value';
    card.appendChild(wLabel);

    const writeRow = document.createElement('div');
    writeRow.className = 'btn-row';

    function makeBtn(text, danger) {
      const b = document.createElement('button');
      b.textContent = text;

      if (danger) {
        b.className = 'danger';
      } else {
        b.style.color = accent;
        b.style.borderColor = accent + '66';
        b.style.background = '#ffffff';
      }

      return b;
    }

    const cmdMap = [
      ['string', 'SET_STRING'],
      ['number', 'SET_NUMBER'],
      ['object', 'SET_OBJECT'],
      ['null', 'SET_NULL'],
    ];

    cmdMap.forEach(([label2, cmd]) => {
      const b = makeBtn(label2);
      b.onclick = () => dispatchCmd(id, cmd);
      writeRow.appendChild(b);
    });

    const delB = makeBtn('delete', true);
    delB.onclick = () => dispatchCmd(id, 'DELETE');
    writeRow.appendChild(delB);
    card.appendChild(writeRow);

    const hr1 = document.createElement('div');
    hr1.className = 'hr';
    card.appendChild(hr1);

    const kvLabel = document.createElement('div');
    kvLabel.className = 'sec-label';
    kvLabel.textContent = 'GM Values';
    card.appendChild(kvLabel);

    const kvTable = document.createElement('div');
    kvTable.className = 'kv-table';
    card.appendChild(kvTable);

    const hr2 = document.createElement('div');
    hr2.className = 'hr';
    card.appendChild(hr2);

    const lcLabel = document.createElement('div');
    lcLabel.className = 'sec-label';
    lcLabel.textContent = 'Listener control';
    card.appendChild(lcLabel);

    const lcRow = document.createElement('div');
    lcRow.className = 'btn-row';

    const rmB = makeBtn('🔇 remove all', true);
    rmB.onclick = () => dispatchCmd(id, 'REMOVE_LISTENERS');

    const reB = makeBtn('🔊 re-register');
    reB.onclick = () => dispatchCmd(id, 'REREGISTER_LISTENERS');

    lcRow.appendChild(rmB);
    lcRow.appendChild(reB);

    const dotWrap = document.createElement('div');
    dotWrap.style.cssText = 'display:flex;gap:6px;align-items:center;margin-top:7px;flex-wrap:wrap;';

    const dotMap = {};

    ALL_KEYS.forEach(k => {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.title = k;

      const lbl2 = document.createElement('span');
      lbl2.style.cssText = 'font-size:10px;color:#475569;';
      lbl2.textContent = k.replace('key_from_', '');

      dotWrap.appendChild(dot);
      dotWrap.appendChild(lbl2);

      dotMap[k] = dot;
    });

    card.appendChild(lcRow);
    card.appendChild(dotWrap);

    const hr3 = document.createElement('div');
    hr3.className = 'hr';
    card.appendChild(hr3);

    const logLabel = document.createElement('div');
    logLabel.className = 'sec-label';
    logLabel.textContent = 'Event log';
    card.appendChild(logLabel);

    const logBox = document.createElement('div');
    logBox.className = 'log-box';
    card.appendChild(logBox);

    const clrB = makeBtn('✕ clear log', true);
    clrB.style.marginTop = '5px';
    clrB.onclick = () => {
      logBox.innerHTML = '';
      state.logs[id] = [];
    };
    card.appendChild(clrB);

    dashboard.appendChild(card);

    panelRefs[id] = {
      kvTable,
      logBox,
      dotMap,
      accent,
      myKey: WRITE_KEY[id],
    };
  });

  /* ── Right iframe strip ─────────────────────────────────── */
  const strip = document.createElement('div');
  strip.id = 'iframe-strip';
  shell.appendChild(strip);

  const BASE_URL = location.href.split('?')[0];

  ['iframe1', 'iframe2', 'iframe3'].forEach(fid => {
    const wrap = document.createElement('div');
    wrap.className = 'iframe-wrap';

    const iframe = document.createElement('iframe');
    iframe.src = `${BASE_URL}?testGMAddValueChangeListener&frameId=${encodeURIComponent(fid)}`;
    iframe.title = fid;

    iframe.onload = () => {
      iframeWindows[fid] = iframe.contentWindow;
    };

    wrap.appendChild(iframe);
    strip.appendChild(wrap);

    iframeWindows[fid] = iframe.contentWindow;
  });

  /* ── Main frame GM logic ───────────────────────────────── */
  (() => {
    const myKey = WRITE_KEY.main;
    const refs = () => panelRefs.main;

    const listenerIds = {};

    function mLog(msg, type = '') {
      const { logBox } = refs();

      const line = document.createElement('div');
      line.className = 'log-line';
      line.innerHTML = `
        <span class="log-time">${nowTime()}</span>
        <span class="log-msg ${escHtml(type)}">${msg}</span>
      `;

      logBox.appendChild(line);
      logBox.scrollTop = logBox.scrollHeight;
    }

    async function mRefreshKV() {
      const { kvTable, myKey: mk, accent } = refs();

      kvTable.innerHTML = '';

      for (const k of ALL_KEYS) {
        const v = await GM_getValue(k, undefined); // main frame
        const own = k === mk;

        const card = document.createElement('div');
        card.className = 'kv-card';

        if (own) card.style.borderColor = accent + '88';

        card.innerHTML = `
          <div class="kv-key">${escHtml(k)}${own ? ' <i>(mine)</i>' : ''}</div>
          <div class="kv-val" style="${own ? `color:${accent};font-weight:700` : ''}">
            ${fmtVal(v)}
          </div>
        `;

        kvTable.appendChild(card);
      }
    }

    function registerMainListeners(isReregister = false) {
      for (const key of ALL_KEYS) {
        if (listenerIds[key] != null) continue;

        const id = GM_addValueChangeListener(key, async (name, oldVal, newVal, remote) => {
          const tag = remote ? '🌐 remote' : '📍 local';

          mLog(
            `${tag} <b>${escHtml(name)}</b>: ${escHtml(JSON.stringify(oldVal))} → <b>${escHtml(JSON.stringify(newVal))}</b>`,
            remote ? 'good' : 'warn'
          );

          await mRefreshKV();
          updateDots('main', Object.entries(listenerIds).map(([k, i]) => ({ key: k, id: i })));
        });

        listenerIds[key] = id;

        mLog(
          `${isReregister ? '👂 Re-registered' : '👂 Listener on'} <b>${escHtml(key)}</b> <small>(id=${escHtml(id)})</small>`,
          'info'
        );
      }

      updateDots('main', Object.entries(listenerIds).map(([k, i]) => ({ key: k, id: i })));
    }

    function removeMainListeners() {
      for (const [k, i] of Object.entries(listenerIds)) {
        try {
          GM_removeValueChangeListener(i);
        } catch (_) { }
        delete listenerIds[k];
      }

      mLog('🔇 All listeners removed', 'warn');
      updateDots('main', []);
    }

    registerMainListeners(false);
    mRefreshKV();

    window._gmtest_mainDispatch = async (cmd) => {
      if (cmd === 'SET_STRING') {
        const v = `hello_${Date.now()}`;
        await GM_setValue(myKey, v);
        mLog(`✏️ Set <b>${escHtml(myKey)}</b> = <b>${escHtml(JSON.stringify(v))}</b>`, 'info');
      }

      if (cmd === 'SET_NUMBER') {
        const v = Math.floor(Math.random() * 99999);
        await GM_setValue(myKey, v);
        mLog(`✏️ Set <b>${escHtml(myKey)}</b> = <b>${escHtml(JSON.stringify(v))}</b>`, 'info');
      }

      if (cmd === 'SET_OBJECT') {
        const v = { ts: Date.now(), from: 'main' };
        await GM_setValue(myKey, v);
        mLog(`✏️ Set <b>${escHtml(myKey)}</b> = <b>${escHtml(JSON.stringify(v))}</b>`, 'info');
      }

      if (cmd === 'SET_NULL') {
        await GM_setValue(myKey, null);
        mLog(`✏️ Set <b>${escHtml(myKey)}</b> = <b>null</b>`, 'info');
      }

      if (cmd === 'DELETE') {
        await GM_deleteValue(myKey);
        mLog(`🗑 Deleted <b>${escHtml(myKey)}</b>`, 'warn');
      }

      if (cmd === 'REMOVE_LISTENERS') {
        removeMainListeners();
      }

      if (cmd === 'REREGISTER_LISTENERS') {
        removeMainListeners();
        registerMainListeners(true);
      }

      await mRefreshKV();
    };
  })();

  /* ── postMessage handler ───────────────────────────────── */
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin) return;
    if (!e.data || !e.data.t) return;

    const { t, frameId: fid, entry, kvMap, ids } = e.data;

    if (!FRAME_IDS.includes(fid)) return;

    if (fid !== 'main' && iframeWindows[fid] && e.source !== iframeWindows[fid]) return;

    if (t === MSG_NS + 'LOG') {
      appendLog(fid, entry);
    }

    if (t === MSG_NS + 'KV') {
      renderKV(fid, kvMap);
    }

    if (t === MSG_NS + 'READY') {
      appendLog(fid, {
        t: nowTime(),
        msg: '🚀 iframe ready',
        type: 'info',
      });
    }

    if (t === MSG_NS + 'LISTENERS') {
      updateDots(fid, ids);
    }
  });

  /* ── dispatchCmd ───────────────────────────────────────── */
  function dispatchCmd(targetId, cmd) {
    if (targetId === 'main') {
      window._gmtest_mainDispatch(cmd);
      return;
    }

    const win = iframeWindows[targetId];

    if (win) {
      sendCmd(win, cmd, {});
    } else {
      appendLog(targetId, {
        t: nowTime(),
        msg: '⚠️ iframe not ready yet — try again',
        type: 'warn',
      });
    }
  }

  /* ── UI helpers ─────────────────────────────────────────── */
  function appendLog(fid, entry) {
    const refs = panelRefs[fid];
    if (!refs || !entry) return;

    const { logBox } = refs;

    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `
      <span class="log-time">${escHtml(entry.t || nowTime())}</span>
      <span class="log-msg ${escHtml(entry.type || '')}">${entry.msg || ''}</span>
    `;

    logBox.appendChild(line);
    logBox.scrollTop = logBox.scrollHeight;
  }

  function renderKV(fid, kvMap) {
    const refs = panelRefs[fid];
    if (!refs || !kvMap) return;

    const { kvTable, myKey, accent } = refs;

    kvTable.innerHTML = '';

    for (const k of ALL_KEYS) {
      const v = kvMap[k];
      const own = k === myKey;

      const card = document.createElement('div');
      card.className = 'kv-card';

      if (own) card.style.borderColor = accent + '88';

      card.innerHTML = `
        <div class="kv-key">${escHtml(k)}${own ? ' <i>(mine)</i>' : ''}</div>
        <div class="kv-val" style="${own ? `color:${accent};font-weight:700` : ''}">
          ${fmtVal(v)}
        </div>
      `;

      kvTable.appendChild(card);
    }
  }

  function updateDots(fid, ids) {
    const refs = panelRefs[fid];
    if (!refs) return;

    const { dotMap } = refs;
    const activeKeys = new Set((ids || []).map(x => x.key));

    for (const [k, dot] of Object.entries(dotMap)) {
      dot.className = 'dot' + (activeKeys.has(k) ? ' on' : '');
    }
  }
})();
