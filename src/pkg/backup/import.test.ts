import { describe, expect, it } from "vitest";
import { createJSZip } from "@App/pkg/utils/jszip-x";
import ZipFileSystem from "@Packages/filesystem/zip/zip";
import { parseBackupZipFile } from "./utils";
import { vmValueUri } from "./self_metadata";

const NS = "http://tampermonkey.net/";
const code = `// ==UserScript==
// @name Example Color Highlighter
// @namespace ${NS}
// @match https://example.com/*
// @exclude https://example.com/admin/*
// @run-at document-idle
// ==/UserScript==
`;
const vm = {
  scripts: {
    "Example Color Highlighter": {
      custom: { origExclude: true, exclude: ["https://example.com/private/*"], runAt: "document-start" },
      config: { enabled: 0 },
      position: 1,
    },
  },
  values: {
    "http-3a-2f-2ftampermonkey.net-2f-0aExample-20Color-20Highlighter-0a": { theme: "sdark", count: "n42" },
  },
};

describe("Violentmonkey 备份导入", () => {
  it("归一 custom→selfMeta、config.enabled(0/1)、position、values", async () => {
    const zip = createJSZip();
    const fs = new ZipFileSystem(zip);
    await fs.create("Example Color Highlighter.user.js").then((w) => w.write(code));
    await fs.create("violentmonkey").then((w) => w.write(JSON.stringify(vm)));
    const data = await parseBackupZipFile(zip);
    const s = data.script[0];
    expect(s.options?.settings.enabled).toBe(false); // config.enabled=0
    expect(s.options?.settings.position).toBe(1);
    expect(s.options?.selfMeta?.exclude).toEqual(["https://example.com/admin/*", "https://example.com/private/*"]);
    expect(s.options?.selfMeta?.["run-at"]).toEqual(["document-start"]);
    expect(s.storage.data).toEqual({ theme: "dark", count: 42 });
  });

  it("归一 custom.tag、lastInstallURL(无 downloadURL 时兜底 file_url)、config.shouldUpdate", async () => {
    const code2 = `// ==UserScript==
// @name VIP工具箱
// @namespace https://www.wandhi.com/
// @match https://www.wandhi.com/*
// ==/UserScript==
`;
    const vm2 = {
      scripts: {
        VIP工具箱: {
          custom: {
            origInclude: true,
            origExclude: true,
            origMatch: true,
            origExcludeMatch: true,
            origTag: true,
            lastInstallURL: "https://scriptcat.org/scripts/code/72/x.user.js",
            pathMap: {},
            match: ["test-match", "hello"],
            exclude: ["test-exclude"],
            tag: ["te", "tag"],
            runAt: "document-end",
            noframes: 1,
          },
          config: { enabled: 1, removed: 0, shouldUpdate: 1, httpOnly: 0 },
          position: 1,
        },
      },
    };
    const zip = createJSZip();
    const fs = new ZipFileSystem(zip);
    await fs.create("VIP工具箱.user.js").then((w) => w.write(code2));
    await fs.create("violentmonkey").then((w) => w.write(JSON.stringify(vm2)));
    const data = await parseBackupZipFile(zip);
    const s = data.script[0];
    expect(s.options?.selfMeta?.match).toEqual(["https://www.wandhi.com/*", "test-match", "hello"]);
    expect(s.options?.selfMeta?.exclude).toEqual(["test-exclude"]);
    expect(s.options?.selfMeta?.tag).toEqual(["te", "tag"]);
    expect(s.options?.selfMeta?.["run-at"]).toEqual(["document-end"]);
    expect(s.options?.selfMeta?.noframes).toEqual([""]);
    expect(s.options?.meta.file_url).toBe("https://scriptcat.org/scripts/code/72/x.user.js");
    expect(s.options?.settings.enabled).toBe(true);
    expect(s.options?.settings.position).toBe(1);
    expect(s.options?.settings.checkUpdate).toBe(true);
  });

  it("custom.downloadURL 优先于 lastInstallURL;shouldUpdate=0 关闭检查更新", async () => {
    const code3 = `// ==UserScript==
// @name DL
// @namespace n
// ==/UserScript==
`;
    const vm3 = {
      scripts: {
        DL: {
          custom: { downloadURL: "https://dl/x.user.js", lastInstallURL: "https://install/x.user.js" },
          config: { enabled: 1, shouldUpdate: 0 },
          position: 0,
        },
      },
    };
    const zip = createJSZip();
    const fs = new ZipFileSystem(zip);
    await fs.create("DL.user.js").then((w) => w.write(code3));
    await fs.create("violentmonkey").then((w) => w.write(JSON.stringify(vm3)));
    const data = await parseBackupZipFile(zip);
    const s = data.script[0];
    expect(s.options?.meta.file_url).toBe("https://dl/x.user.js");
    expect(s.options?.settings.checkUpdate).toBe(false);
  });

  it("value uri 用脚本默认 @name 重建,兼容本地化名脚本(文件名为 @name:zh-CN 显示名)", async () => {
    // 真实 VM 导出:scripts 键/文件名用本地化显示名,但 values 的 uri 用默认 @name 建键
    const codeL = `// ==UserScript==
// @name Immersive Translate: AI Web, PDF & Video Translator
// @name:zh-CN 沉浸式翻译 - AI 双语网页翻译
// @namespace https://immersive-translate.owenyoung.com/
// @match *://*/*
// ==/UserScript==
`;
    const zipName = "沉浸式翻译 - AI 双语网页翻译"; // VM getScriptName 用显示名
    const vmL = {
      scripts: { [zipName]: { custom: {}, config: { enabled: 1 }, position: 0 } },
      values: {
        [vmValueUri(
          "https://immersive-translate.owenyoung.com/",
          "Immersive Translate: AI Web, PDF & Video Translator"
        )]: { cfg: "sX", n: "n7" },
      },
    };
    const zip = createJSZip();
    const fs = new ZipFileSystem(zip);
    await fs.create(`${zipName}.user.js`).then((w) => w.write(codeL));
    await fs.create("violentmonkey").then((w) => w.write(JSON.stringify(vmL)));
    const data = await parseBackupZipFile(zip);
    expect(data.script[0].storage.data).toEqual({ cfg: "X", n: 7 });
  });
});
