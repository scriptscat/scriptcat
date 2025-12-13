import { ExtVersion } from "@App/app/const";
import type { Script } from "@App/app/repo/scripts";
import type { Value } from "@App/app/repo/value";
import { type JSZipFile } from "@App/pkg/utils/jszip-x";
import packageTpl from "@App/template/cloudcat-package/package.tpl";
import utilsTpl from "@App/template/cloudcat-package/utils.tpl";
import indexTpl from "@App/template/cloudcat-package/index.tpl";
import type { ExportCookies, ExportParams } from "./cloudscript";
import type CloudScript from "./cloudscript";

// 导出到本地,一个可执行到npm包
export default class LocalCloudScript implements CloudScript {
  zip: JSZipFile;

  params: ExportParams;

  constructor(params: ExportParams) {
    this.zip = params.zip! as JSZipFile;
    this.params = params;
  }

  exportCloud(script: Script, code: string, values: Value[], cookies: ExportCookies[]): Promise<void> {
    this.zip.file("userScript.js", code);
    this.zip.file("cookies.js", `exports.cookies = ${JSON.stringify(cookies)}`);
    this.zip.file("values.js", `exports.values = ${JSON.stringify(values)}`);
    this.zip.file(
      "config.js",
      `export default ${JSON.stringify({
        version: ExtVersion,
        uuid: script.uuid,
        overwrite: {
          value: this.params.overwriteValue,
          cookie: this.params.overwriteCookie,
        },
      })}`
    );
    this.zip.file("package.json", <string>packageTpl);
    this.zip.file("utils.js", <string>utilsTpl);
    this.zip.file("index.js", <string>indexTpl);
    return Promise.resolve();
  }
}
