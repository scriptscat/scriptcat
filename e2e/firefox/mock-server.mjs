/* global process, Buffer */
// GM API mock server + script patchers, mirrored from e2e/gm-api.spec.ts so the Firefox
// (Selenium/geckodriver) run exercises the SAME userscript under the SAME mocked endpoints
// as the Chrome Playwright suite. Firefox has no --host-resolver-rules, so the target host
// is 127.0.0.1 and the CSP header is applied to the target HTML page directly (NO_CSP=1
// disables it). The userscript itself is served so ScriptCat's install page can fetch it.
import { createServer } from "http";

export function startGMApiMockServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      const url = new URL(req.url || "/", `http://${req.headers.host}`);

      if (url.pathname === "/get") {
        res.writeHead(200, { "Content-Type": "application/json" });
        const args = Object.fromEntries(url.searchParams.entries());
        res.end(JSON.stringify({ url: `http://${req.headers.host}${url.pathname}`, args }));
        return;
      }
      if (url.pathname === "/repos/scriptscat/scriptcat") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ name: "scriptcat", full_name: "scriptscat/scriptcat", description: "ScriptCat" }));
        return;
      }
      if (url.pathname === "/favicon.ico") {
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
            "base64"
          )
        );
        return;
      }
      const bytesMatch = url.pathname.match(/^\/bytes\/(\d+)$/);
      if (bytesMatch) {
        res.writeHead(200, { "Content-Type": "application/octet-stream" });
        res.end(Buffer.alloc(Number(bytesMatch[1]), "a"));
        return;
      }
      const delayMatch = url.pathname.match(/^\/delay\/(\d+)$/);
      if (delayMatch) {
        setTimeout(
          () => {
            if (res.destroyed) return;
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ url: `http://${req.headers.host}${url.pathname}` }));
          },
          Number(delayMatch[1]) * 1000
        );
        return;
      }
      // Serve the userscript so ScriptCat's install page can fetch it via ?url=.
      if (typeof server._userScript === "string" && url.pathname.endsWith(".user.js")) {
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        res.end(server._userScript);
        return;
      }
      // Main target HTML page — apply the same script-src 'none' CSP the Chrome suite uses,
      // so ScriptCat's CSP-bypassing injection (GM_addStyle/GM_addElement) is exercised.
      if (process.env.NO_CSP !== "1") {
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'none'; script-src 'none'; style-src 'none'; img-src 'self'; connect-src 'self'"
        );
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        '<!doctype html><html><head><title>ScriptCat E2E</title></head><body><main class="container"><div class="masthead">ScriptCat E2E</div></main></body></html>'
      );
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        origin: `http://127.0.0.1:${port}`,
        port,
        setUserScript: (code) => {
          server._userScript = code;
        },
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

// --- script patchers (mirroring e2e/gm-api.spec.ts) ---

export function patchScriptCode(code) {
  return code
    .replace(/^(\/\/\s*@(?:require|resource)\s+.*?)#sha(?:256|384|512)[=-][^\s]+/gm, "$1")
    .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\//g, "https://unpkg.com/");
}

export function patchTargetMatchCode(code, targetUrl) {
  const url = new URL(targetUrl);
  // Firefox match patterns do not match the query string in the path glob, so unlike the
  // Chrome suite (which keeps `?gm_api_sync`) we match the whole host path. The dedicated
  // per-run 127.0.0.1:<port> origin keeps this scoped to just the target page.
  const targetPattern = `${url.protocol}//${url.hostname}/*`;
  return code.replace(
    /^\/\/\s*@match\s+.*\?(gm_api_sync|gm_api_async|inject_content|WINDOW_MESSAGE_TEST_SC|SANDBOX_TEST_SC|unwrap_e2e_test)$/gm,
    `// @match        ${targetPattern}`
  );
}

export function patchGMApiTestCode(code, mockOrigin) {
  const mockHost = new URL(mockOrigin).host;
  return code
    .replace(/^\/\/\s*@connect\s+api\.github\.com$/gm, `// @connect      127.0.0.1`)
    .replace(/^\/\/\s*@connect\s+httpbun\.com$/gm, `// @connect      127.0.0.1`)
    .replace(/https:\/\/api\.github\.com\/repos\/scriptscat\/scriptcat/g, `${mockOrigin}/repos/scriptscat/scriptcat`)
    .replace(/https:\/\/httpbun\.com\/get/g, `${mockOrigin}/get`)
    .replace(/https:\/\/httpbun\.com\/bytes\/64/g, `${mockOrigin}/bytes/64`)
    .replace(/https:\/\/httpbun\.com\/delay\/5/g, `${mockOrigin}/delay/5`)
    .replace(/https:\/\/www\.tampermonkey\.net\/favicon\.ico/g, `${mockOrigin}/favicon.ico`)
    .replace(/api\.github\.com\/repos\/scriptscat\/scriptcat/g, `${mockHost}/repos/scriptscat/scriptcat`)
    .replace(/httpbun\.com\/get/g, `${mockHost}/get`);
}
