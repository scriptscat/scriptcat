<template>
  <v-dialog
    v-if="script.type !== 1"
    transition="dialog-bottom-transition"
    max-width="600"
  >
    <template v-slot:activator="{ on, attrs }">
      <v-icon small @click="popup()" v-bind="attrs" v-on="on">
        mdi-cloud-upload
      </v-icon>
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
            label="Cookie导出表达式"
            rows="2"
            row-height="2"
          ></v-textarea>

          <div v-if="dest == 'local'"></div>
          <div v-else-if="dest == 'remote'"></div>
        </div>
        <v-card-actions class="justify-end">
          <v-btn text color="success">{{ btnText[dest] || "上传" }}</v-btn>
        </v-card-actions>
      </v-card>
    </template>
  </v-dialog>
</template>

<script lang="ts">
import { Script } from "@App/model/do/script";
import { Component, Prop, Vue } from "vue-property-decorator";

@Component({})
export default class ResizableEditor extends Vue {
  @Prop()
  script!: Script;

  popup() {}

  dest: string = "local";
  dests = [
    { key: "local", value: "本地" },
    // { key: "remote", value: "云端" },
    // { key: "self", value: "自建服务器" },
  ];
  btnText = { local: "导出" };
}
</script>
