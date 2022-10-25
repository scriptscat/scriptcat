import JSZip from "jszip";
import ZipFileSystem from "@Pkg/filesystem/zip/zip";
import initTestEnv from "../utils/test_utils";
import BackupExport from "./export";
import BackupImport from "./import";
import { BackupData, ScriptOptions } from "./struct";

initTestEnv();

describe("backup", () => {
  const zipFile = new JSZip();
  const fs = new ZipFileSystem(zipFile);
  it("empty", async () => {
    await new BackupExport(fs).export({
      script: [],
      subscribe: [],
    });
    const resp = await new BackupImport(fs).parse();
    expect(resp).toEqual({
      script: [],
      subscribe: [],
    });
  });

  it("export and import script", async () => {
    const data: BackupData = {
      script: [
        {
          code: `// ==UserScript==
          // @name         New Userscript
          // @namespace    https://bbs.tampermonkey.net.cn/
          // @version      0.1.0
          // @description  try to take over the world!
          // @author       You
          // @match        {{match}}
          // ==/UserScript==
          
          console.log('hello world')`,
          options: {
            options: {},
            meta: {
              name: "test",
              modified: 1,
              file_url: "",
            },
            settings: {
              enabled: true,
              position: 1,
            },
          },
          resources: [
            {
              meta: { name: "test1", mimetype: "text/plain" },
              base64: "aGVsbG8gd29ybGQ=",
              source: "hello world",
            },
          ],
          requires: [
            {
              meta: { name: "test2", mimetype: "text/plain" },
              base64: "aGVsbG8gd29ybGQ=",
              source: "hello world",
            },
          ],
          requiresCss: [
            {
              meta: { name: "test3", mimetype: "text/plain" },
              base64: "aGVsbG8gd29ybGQ=",
              source: "hello world",
            },
          ],
          storage: {
            ts: 1,
            data: {
              data: 1,
            },
          },
        },
      ],
      subscribe: [
        {
          source: `// ==UserSubscribe==
          // @name         New Usersubscribe
          // @namespace    https://bbs.tampermonkey.net.cn/
          // @version      0.1.0
          // @description  try to take over the world!
          // @author       You
          // ==/UserSubscribe==
          
          console.log('hello world')`,
          options: {
            meta: {
              name: "test",
              modified: 1,
              url: "",
            },
          },
        },
      ],
    } as unknown as BackupData;
    await new BackupExport(fs).export(data);
    const resp = await new BackupImport(fs).parse();
    expect(resp).toEqual(data);
  });
});
