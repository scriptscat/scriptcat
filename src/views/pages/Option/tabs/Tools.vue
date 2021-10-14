<template>
  <div>
    <input
      id="import-file"
      type="file"
      @change="importFileChange"
      style="display: none"
    />
    <Panels :configs="configs" />
  </div>
</template>

<script lang="ts">
import { ScriptController } from "@App/apps/script/controller";
import { Vue, Component } from "vue-property-decorator";
import Panels from "@App/views/components/Panels.vue";
import { saveAs } from "file-saver";
import { File } from "@App/model/do/back";

@Component({
  components: { Panels },
})
export default class Tools extends Vue {
  scriptCtrl = new ScriptController();

  panel = [0, 1, 2, 3];

  configs = {
    备份: {
      items: [
        {
          type: "button",
          title: "导出文件",
          describe: "导出备份文件",
          color: "accent",
          click: this.clickExportFile,
        },
        {
          type: "button",
          title: "导入文件",
          describe: "导入备份文件",
          color: "blue-grey",
          click: this.clickImportFile,
        },
      ],
    },
  };

  importFileChange(ev: Event) {
    let file = (<HTMLInputElement>ev.target!).files![0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // 处理导入文件
      let { data, err } = this.scriptCtrl.parseBackFile(<string>reader.result);
      if (err) {
        return alert(err);
      }
      this.scriptCtrl.openImportFileWindow(data!);
    };
    reader.readAsText(file);
  }

  clickImportFile() {
    let importFile = <HTMLInputElement>document.getElementById("import-file")!;
    importFile.click();
  }

  clickExportFile() {
    let file: File = {
      created_by: "ScriptCat",
      version: "1",
      scripts: [],
      settings: {},
    };
    let nowTime = new Date();
    saveAs(
      JSON.stringify(file),
      "scriptcat-backup" +
        `${nowTime.getFullYear()}-${nowTime.getMonth()}-${nowTime.getDate()} ${nowTime.getHours()}-${nowTime.getMinutes()}-${nowTime.getSeconds()}` +
        ".json"
    );
  }

}
</script>
