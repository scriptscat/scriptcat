import { createJSZip } from "@App/pkg/utils/jszip-x";
import BackupExport from "./export";
import { parseBackupZipFile } from "./utils";
import type { BackupData } from "./struct";
import { describe, expect, it } from "vitest";
import ZipFileSystem from "@Packages/filesystem/zip/zip";

const ts0 = Date.now() - 5000;
describe.concurrent("backup", () => {
  it.concurrent("empty", async () => {
    const zipFile = createJSZip();
    const fs = new ZipFileSystem(zipFile);
    await new BackupExport(fs).export({
      script: [],
      subscribe: [],
    });
    const resp = await parseBackupZipFile(zipFile);
    expect(resp).toEqual({
      script: [],
      subscribe: [],
    });
  });

  it.concurrent("export and import script - basic", async () => {
    const zipFile = createJSZip();
    const fs = new ZipFileSystem(zipFile);
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
              base64: "data:text/plain;base64,aGVsbG8gd29ybGQ=",
              source: "hello world",
            },
          ],
          requires: [
            {
              meta: { name: "test2", mimetype: "text/plain" },
              base64: "data:text/plain;base64,aGVsbG8gd29ybGQ=",
              source: "hello world",
            },
          ],
          requiresCss: [
            {
              meta: { name: "test3", mimetype: "application/javascript" },
              base64: "data:application/javascript;base64,aGVsbG8gd29ybGQ=",
              source: "hello world",
            },
          ],
          storage: {
            ts: ts0 + 1,
            data: {
              num: 1,
              str: "data",
              bool: false,
            },
          },
          lastModificationDate: expect.any(Number),
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
          lastModificationDate: expect.any(Number),
        },
      ],
    } as unknown as BackupData;
    await new BackupExport(fs).export(data);
    expect(data.script[0].storage.data.num).toEqual("n1");
    expect(data.script[0].storage.data.str).toEqual("sdata");
    expect(data.script[0].storage.data.bool).toEqual("bfalse");
    const resp = await parseBackupZipFile(zipFile);
    data.script[0].storage.data.num = 1;
    data.script[0].storage.data.str = "data";
    data.script[0].storage.data.bool = false;
    expect(resp).toEqual(data);
  });

  it.concurrent("export and import script - name and version only", async () => {
    const zipFile = createJSZip();
    const fs = new ZipFileSystem(zipFile);
    const data: BackupData = {
      script: [
        {
          code: `// ==UserScript==
          // @name         New Userscript
          // @version      1
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
              base64: "data:text/plain;base64,aGVsbG8gd29ybGQ=",
              source: "hello world",
            },
          ],
          requires: [
            {
              meta: { name: "test2", mimetype: "text/plain" },
              base64: "data:text/plain;base64,aGVsbG8gd29ybGQ=",
              source: "hello world",
            },
          ],
          requiresCss: [
            {
              meta: { name: "test3", mimetype: "application/javascript" },
              base64: "data:application/javascript;base64,aGVsbG8gd29ybGQ=",
              source: "hello world",
            },
          ],
          storage: {
            ts: ts0 + 2,
            data: {
              num: 1,
              str: "data",
              bool: false,
            },
          },
          lastModificationDate: expect.any(Number),
        },
      ],
      subscribe: [],
    } as unknown as BackupData;
    await new BackupExport(fs).export(data);
    expect(data.script[0].storage.data.num).toEqual("n1");
    expect(data.script[0].storage.data.str).toEqual("sdata");
    expect(data.script[0].storage.data.bool).toEqual("bfalse");
    const resp = await parseBackupZipFile(zipFile);
    data.script[0].storage.data.num = 1;
    data.script[0].storage.data.str = "data";
    data.script[0].storage.data.bool = false;
    expect(resp).toEqual(data);
  });

  it.concurrent("export and import script - 2 scripts", async () => {
    const zipFile = createJSZip();
    const fs = new ZipFileSystem(zipFile);
    const data: BackupData = {
      script: [
        {
          code: `// ==UserScript==
          // @name         New Userscript 1
          // @version      1
          // ==/UserScript==
          
          console.log('hello world')`,
          options: {
            options: {},
            meta: {
              name: "test01", // 不能重复
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
              base64: "data:text/plain;base64,aGVsbG8gd29ybGQ=",
              source: "hello world",
            },
          ],
          requires: [
            {
              meta: { name: "test2", mimetype: "text/plain" },
              base64: "data:text/plain;base64,aGVsbG8gd29ybGQ=",
              source: "hello world",
            },
          ],
          requiresCss: [
            {
              meta: { name: "test3", mimetype: "application/javascript" },
              base64: "data:application/javascript;base64,aGVsbG8gd29ybGQ=",
              source: "hello world",
            },
          ],
          storage: {
            ts: ts0 + 3,
            data: {
              num: 1,
              str: "data",
              bool: false,
            },
          },
          lastModificationDate: expect.any(Number),
        },
        {
          code: `// ==UserScript==
          // @name         New Userscript 2
          // @version      1
          // ==/UserScript==
          
          console.log('hello world')`,
          options: {
            options: {},
            meta: {
              name: "test02", // 不能重复
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
              base64: "data:text/plain;base64,aGVsbG8gd29ybGQ=",
              source: "hello world",
            },
          ],
          requires: [
            {
              meta: { name: "test2", mimetype: "text/plain" },
              base64: "data:text/plain;base64,aGVsbG8gd29ybGQ=",
              source: "hello world",
            },
          ],
          requiresCss: [
            {
              meta: { name: "test3", mimetype: "application/javascript" },
              base64: "data:application/javascript;base64,aGVsbG8gd29ybGQ=",
              source: "hello world",
            },
          ],
          storage: {
            ts: ts0 + 4,
            data: {},
          },
          lastModificationDate: expect.any(Number),
        },
      ],
      subscribe: [],
    } as unknown as BackupData;
    await new BackupExport(fs).export(data);
    expect(data.script[0].storage.data.num).toEqual("n1");
    expect(data.script[0].storage.data.str).toEqual("sdata");
    expect(data.script[0].storage.data.bool).toEqual("bfalse");
    const resp = await parseBackupZipFile(zipFile);
    data.script[0].storage.data.num = 1;
    data.script[0].storage.data.str = "data";
    data.script[0].storage.data.bool = false;
    expect(resp).toEqual(data);
  });

  it.concurrent("export and import script - 30 scripts + 20 subscribes", async () => {
    const zipFile = createJSZip();
    const fs = new ZipFileSystem(zipFile);
    const data: BackupData = {
      script: Array.from({ length: 30 }, (v, i) => {
        return {
          code: `// ==UserScript==
          // @name         New Userscript ${i}
          // @version      1
          // ==/UserScript==
          
          console.log('hello world')`,
          options: {
            options: {},
            meta: {
              name: `test_${i}`, // 不能重复
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
              base64: "data:text/plain;base64,aGVsbG8gd29ybGQ=",
              source: "hello world",
            },
          ],
          requires: [
            {
              meta: { name: "test2", mimetype: "text/plain" },
              base64: "data:text/plain;base64,aGVsbG8gd29ybGQ=",
              source: "hello world",
            },
          ],
          requiresCss: [
            {
              meta: { name: "test3", mimetype: "application/javascript" },
              base64: "data:application/javascript;base64,aGVsbG8gd29ybGQ=",
              source: "hello world",
            },
          ],
          storage: {
            ts: ts0 + 5,
            data: {},
          },
          lastModificationDate: expect.any(Number),
        };
      }),
      subscribe: Array.from({ length: 20 }, (v, i) => {
        return {
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
              name: `test_${i}`, // 不能重复
              modified: 1,
              url: "",
            },
          },
          lastModificationDate: expect.any(Number),
        };
      }),
    } as unknown as BackupData;
    await new BackupExport(fs).export(data);
    const resp = await parseBackupZipFile(zipFile);
    expect(resp).toEqual(data);
  });
});
