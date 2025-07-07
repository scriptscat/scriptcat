import { ExtVersion } from "@App/app/const";
import { Script } from "@App/app/repo/scripts";
import { Value } from "@App/app/repo/value";
import JSZip from "jszip";
import packageTpl from "@App/template/cloudcat-package/package.tpl";
import utilsTpl from "@App/template/cloudcat-package/utils.tpl";
import indexTpl from "@App/template/cloudcat-package/index.tpl";
import CloudScript, { ExportCookies, ExportParams } from "./cloudscript";

// 导出到本地,一个可执行到npm包
export default class LocalCloudScript implements CloudScript {
  zip: JSZip;

  params: ExportParams;

  constructor(params: ExportParams) {
    this.zip = params.zip! as JSZip;
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
