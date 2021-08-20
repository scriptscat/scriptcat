<template>
  <v-dialog transition="dialog-bottom-transition" max-width="600">
    <template v-slot:activator="{ on, attrs }">
      <v-icon small v-bind="attrs" v-on="on"> mdi-cloud-upload </v-icon>
    </template>
    <template v-slot:default="dialog">
      <v-card>
        <v-toolbar color="primary" dark>
          <v-toolbar-title>上传至云端执行</v-toolbar-title>
          <v-spacer></v-spacer>
          <v-toolbar-items>
            <v-btn icon dark @click="dialog.value = false" right>
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </v-toolbar-items>
        </v-toolbar>
        <div style="padding: 10px; box-sizing: border-box">
          <v-select
            label="上传至"
            v-model="dest"
            :items="dests"
            item-text="value"
            item-value="key"
            hint="将脚本上传至云端自动运行,如果选择本地将会导出成一个文件."
            persistent-hint
            return-object
            single-line
          ></v-select>

          <v-textarea
            label="值导出表达式"
            rows="2"
            row-height="2"
            :value="exportValue"
          ></v-textarea>

          <v-textarea
            label="Cookie导出表达式"
            rows="2"
            row-height="2"
            :value="exportCookie"
          ></v-textarea>

          <div v-if="dest == 'local'"></div>
          <div v-else-if="dest == 'remote'"></div>
        </div>
        <v-card-actions class="justify-end">
          <v-btn text color="success" @click="submit">{{
            btnText[dest] || "提交"
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

@Component({})
export default class ResizableEditor extends Vue {
  @Prop()
  script!: Script;

  exportCookie: string = "";
  exportValue: string = "";

  dest: string = "local";
  dests = [
    { key: "local", value: "本地" },
    // { key: "remote", value: "云端" },
    // { key: "self", value: "自建服务器" },
  ];
  btnText = { local: "导出" };

  mounted() {
    this.script.metadata["exportcookie"] &&
      this.script.metadata["exportcookie"].forEach((val) => {
        this.exportCookie += val + "\n";
      });
    this.script.metadata["exportvalue"] &&
      this.script.metadata["exportvalue"].forEach((val) => {
        this.exportValue += val + "\n";
      });
  }

  submit() {
    switch (this.dest) {
      case "local":
        this.local();
        break;
    }
  }

  local() {
    let zip = this.pack();
    zip.generateAsync({ type: "blob" }).then((content) => {
      saveAs(content, this.script.name + ".zip");
    });
  }

  pack() {
    let zip = new JSZip();
    zip.file("userScript.js", this.script.code);
    let params = this.exportCookie.split(";");

    // zip.file("cookie.json");
    // zip.file("value.json");
    return zip;
  }
}
</script>
