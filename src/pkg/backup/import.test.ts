import { describe, expect, it } from "vitest";
import { createJSZip } from "@App/pkg/utils/jszip-x";
import ZipFileSystem from "@Packages/filesystem/zip/zip";
import { parseBackupZipFile } from "./utils";

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
});
