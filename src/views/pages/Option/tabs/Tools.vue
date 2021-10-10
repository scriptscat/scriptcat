<template>
  <v-expansion-panels v-model="panel" multiple focusable>
    <input
      id="import-file"
      type="file"
      @change="importFileChange"
      style="display: none"
    />
    <v-expansion-panel v-for="(val, key) in configs" :key="key">
      <v-expansion-panel-header
        style="min-height: auto; font-size: 16px; font-weight: bold"
        >{{ key }}</v-expansion-panel-header
      >
      <v-expansion-panel-content>
        <div v-for="(val, key) in val.items" class="config-item" :key="key">
          <div v-if="val.type == 'button'">
            <v-btn
              :color="val.color"
              @click="val.click"
              :loading="val.loading"
              style="color: #fff"
              small
              >{{ val.title }}</v-btn
            >
          </div>
        </div>
      </v-expansion-panel-content>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<script lang="ts">
import { ScriptController } from "@App/apps/script/controller";
import { files } from "jszip";
import { Vue, Component } from "vue-property-decorator";

@Component({})
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
          click(val: any) {},
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

  created() {}
}
</script>

<style scoped>
.config-item {
  margin-top: 10px;
  font-size: 14px;
}

.config-item .config-select {
  margin-top: 20px;
}

.config-item .config-title {
  display: inline-block;
  width: 200px;
}

.config-item .config-content {
  display: inline-block;
}
</style>
