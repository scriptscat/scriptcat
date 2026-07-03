/* global Buffer */
// Launch Firefox via Selenium + geckodriver with ScriptCat installed as a temporary MV3
// add-on. Unlike Playwright's Firefox, geckodriver (Marionette) can render moz-extension://
// UI pages, so this drives ScriptCat's real install page / options UI.
//
// The add-on is installed UNPACKED (directory) through geckodriver's raw moz/addon/install
// endpoint rather than driver.installAddon(), which zips the directory. From a zipped temp
// add-on Firefox's content process cannot load content-script *source files* ("IPDL protocol
// Error: invalid file descriptor" → "Unable to load script: .../src/scripting.js"), which
// breaks ScriptCat's content bridge and silently stops every userscript from running.
import fs from "fs";
import os from "os";
import path from "path";
import net from "net";
import http from "http";
import { Builder } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import { createRequire } from "module";
import { GECKO_ID, EXT_UUID } from "./build-ext.mjs";

const require = createRequire(import.meta.url);
const { download, start } = require("geckodriver");

const EXT_DIR = path.resolve(import.meta.dirname, "../../dist/firefox");

function freeTcpPort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

function installUnpackedAddon(port, sessionId, dir) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ path: dir, temporary: true });
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: `/session/${sessionId}/moz/addon/install`,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      },
      (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () =>
          res.statusCode === 200 ? resolve(JSON.parse(b).value) : reject(new Error(`install ${res.statusCode}: ${b}`))
        );
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

export async function launchFirefox({ headless = true } = {}) {
  // Profile template pre-granting the MV3 host controls + userScripts optional permission,
  // so ScriptCat can register userScripts and inject without an interactive grant.
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "ff-sc-prof-"));
  fs.writeFileSync(
    path.join(profileDir, "extension-preferences.json"),
    JSON.stringify({ [GECKO_ID]: { permissions: ["userScripts"], origins: ["<all_urls>"] } })
  );

  const options = new firefox.Options();
  if (headless) options.addArguments("-headless");
  options.setPreference("extensions.manifestV3.enabled", true);
  // Pin the internal moz-extension UUID so options/install URLs are known up front.
  options.setPreference("extensions.webextensions.uuids", JSON.stringify({ [GECKO_ID]: EXT_UUID }));
  options.setPreference("xpinstall.signatures.required", false);
  // Extension pages open new tabs; keep them in the same window so Selenium can switch.
  options.setPreference("browser.link.open_newwindow", 3);
  if (typeof options.setProfile === "function") options.setProfile(profileDir);

  const geckoPath = await download();
  // Retry once: launching a real Firefox occasionally flakes ("Process ... unexpectedly
  // closed with status 0") on the first try, especially under load.
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const port = await freeTcpPort();
    const gecko = await start({
      customGeckoDriverPath: geckoPath,
      host: "127.0.0.1",
      port,
      spawnOpts: { stdio: ["ignore", "ignore", "ignore"] },
    });
    await new Promise((r) => setTimeout(r, 1200));
    try {
      const driver = await new Builder()
        .usingServer(`http://127.0.0.1:${port}`)
        .forBrowser("firefox")
        .setFirefoxOptions(options)
        .build();
      const sessionId = (await driver.getSession()).getId();
      const addonId = await installUnpackedAddon(port, sessionId, EXT_DIR);
      const extUrl = (p) => `moz-extension://${EXT_UUID}/${p.replace(/^\//, "")}`;
      const cleanup = async () => {
        await driver.quit().catch(() => {});
        try {
          gecko.kill();
        } catch {
          /* already exited */
        }
        fs.rmSync(profileDir, { recursive: true, force: true });
      };
      return { driver, addonId, extUrl, cleanup };
    } catch (e) {
      lastErr = e;
      try {
        gecko.kill();
      } catch {
        /* already exited */
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  fs.rmSync(profileDir, { recursive: true, force: true });
  throw lastErr;
}
