<template>
  <v-dialog transition="dialog-bottom-transition" max-width="600">
    <template v-slot:activator="{ on, attrs }">
      <v-icon small v-bind="attrs" v-on="on"
        >{{ icons.mdiCloudUpload }}
      </v-icon>
    </template>
    <template v-slot:default="dialog">
      <v-card>
        <v-toolbar color="primary" dark>
          <v-toolbar-title>上传至云端执行</v-toolbar-title>
          <v-spacer></v-spacer>
          <v-toolbar-items>
            <v-btn icon dark @click="dialog.value = false" right>
              <v-icon>{{ icons.mdiClose }}</v-icon>
            </v-btn>
          </v-toolbar-items>
        </v-toolbar>
        <div style="padding: 10px; box-sizing: border-box">
          <v-input :v-model="exportConfig.uuid" disabled> </v-input>
          <v-select
            label="上传至"
            v-model="exportConfig.dest"
            :items="dests"
            item-text="value"
            item-value="key"
            hint="将脚本上传至云端自动运行,如果选择本地将会导出成一个文件."
            persistent-hint
            return-object
            single-line
          ></v-select>

          <v-textarea
            v-model="exportConfig.exportValue"
            label="值导出表达式"
            rows="2"
            row-height="2"
            hide-details
          ></v-textarea>
          <v-checkbox
            v-model="exportConfig.overwriteValue"
            label="导入时覆盖原值"
            color="success"
            hide-details
          ></v-checkbox>
          <v-textarea
            v-model="exportConfig.exportCookie"
            label="Cookie导出表达式"
            rows="2"
            row-height="2"
            hide-details
          ></v-textarea>
          <v-checkbox
            v-model="exportConfig.overwriteCookie"
            label="导入时覆盖原Cookie"
            color="success"
            hide-details
          ></v-checkbox>
          <div v-if="exportConfig.dest == 'local'"></div>
          <div v-else-if="exportConfig.dest == 'remote'"></div>
        </div>
        <v-card-actions class="justify-end">
          <v-btn text color="success" @click="submit">{{
            btnText[exportConfig.dest] || "提交"
          }}</v-btn>
        </v-card-actions>
      </v-card>
    </template>
  </v-dialog>
</template>

<script lang="ts">
import { Script } from "@App/model/do/script";
import { Component, Prop, Vue } from "vue-property-decorator";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { ValueModel } from "@App/model/value";
import { ExportModel } from "@App/model/export";
import { Value } from "@App/model/do/value";
import { Export, EXPORT_DEST_LOCAL } from "@App/model/do/export";
import { v4 as uuidv4 } from "uuid";
import { mdiCloudUpload, mdiClose } from "@mdi/js";
import { ExtVersion } from "@App/apps/config";
@Component({})
export default class BgCloud extends Vue {
  icons = { mdiCloudUpload, mdiClose };

  @Prop()
  script!: Script;
  exportConfig: Export = {
    id: 0,
    uuid: "",
    scriptId: 0,
    dest: 1,
    overwriteValue: false,
    overwriteCookie: false,
    exportCookie: "",
    exportValue: "",
  };

  exportModel = new ExportModel();
  valueModel = new ValueModel();

  dests = [
    { key: EXPORT_DEST_LOCAL, value: "本地" },
    // { key: "remote", value: "云端" },
    // { key: "self", value: "自建服务器" },
  ];

  btnText = { 1: "导出" };

  async mounted() {
    let e = await this.exportModel.findOne({
      scriptId: this.script.id,
      dest: this.exportConfig.dest,
    });
    if (e) {
      this.exportConfig = e;
    } else {
      let exportCookie = "";
      this.script.metadata["exportcookie"] &&
        this.script.metadata["exportcookie"].forEach((val) => {
          exportCookie += val + "\n";
        });
      let exportValue = "";
      this.script.metadata["exportvalue"] &&
        this.script.metadata["exportvalue"].forEach((val) => {
          exportValue += val + "\n";
        });

      this.exportConfig = {
        id: 0,
        uuid: uuidv4(),
        scriptId: this.script.id,
        dest: this.exportConfig.dest,
        overwriteValue: false,
        overwriteCookie: false,
        exportCookie: exportCookie,
        exportValue: exportValue,
      };
      this.exportModel.save(this.exportConfig);
    }
  }

  submit() {
    switch (this.exportConfig.dest) {
      case EXPORT_DEST_LOCAL:
        this.local();
        break;
    }
  }

  async local() {
    let zip = await this.pack();
    this.exportModel.save(this.exportConfig);
    zip.generateAsync({ type: "blob" }).then((content) => {
      saveAs(content, this.script.name + ".zip");
    });
  }

  pack(): Promise<JSZip> {
    return new Promise(async (resolve) => {
      let zip = new JSZip();
      zip.file("userScript.js", this.script.code);
      let lines = this.exportConfig.exportCookie.split("\n");
      let cookies: { [key: string]: chrome.cookies.Cookie[] } = {};
      let cookie = false;
      for (let i = 0; i < lines.length; i++) {
        let val = lines[0];
        let detail: any = {};
        val.split(";").forEach((param) => {
          let s = param.split("=");
          if (s.length != 2) {
            return;
          }
          detail[s[0]] = s[1].trim();
        });
        if (!detail.url && !detail.domain) {
          continue;
        }
        cookie = true;
        if (detail.url) {
          let u = new URL(detail.url);
          cookies[u.host] = await this.getCookie(detail);
        } else {
          cookies[detail.domain] = await this.getCookie(detail);
        }
      }
      cookie && zip.file("cookie.json", JSON.stringify(cookies));

      lines = this.exportConfig.exportValue.split("\n");
      let values: Value[] = [];
      for (let i = 0; i < lines.length; i++) {
        let val = lines[0];
        let keys = val.split(",");
        for (let n = 0; n < keys.length; n++) {
          let value = await this.getValue(keys[n]);
          if (value) {
            values.push(value);
          }
        }
      }
      zip.file("value.json", JSON.stringify(values));
      zip.file(
        "config.json",
        JSON.stringify({
          version: ExtVersion,
          uuid: this.exportConfig.uuid,
          overwrite: {
            value: this.exportConfig.overwriteValue,
            cookie: this.exportConfig.overwriteCookie,
          },
        })
      );
      resolve(zip);
    });
  }

  getCookie(detail: any): Promise<chrome.cookies.Cookie[]> {
    return new Promise((resolve) => {
      chrome.cookies.getAll(detail, (cookies) => {
        resolve(cookies);
      });
    });
  }

  getValue(key: any): Promise<any> {
    return new Promise(async (resolve) => {
      let model: Value | undefined;
      if (this.script.metadata["storagename"]) {
        model = await this.valueModel.findOne({
          storageName: this.script.metadata["storagename"][0],
          key: key,
        });
      } else {
        model = await this.valueModel.findOne({
          scriptId: this.script,
          key: key,
        });
      }
      if (model) {
        resolve(model);
      } else {
        resolve(undefined);
      }
    });
  }
}
</script>
