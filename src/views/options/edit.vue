<template>
  <div style="height: 100%">
    <div class="info">
      <div class="name">{{ script.name }}</div>
      <div class="control"></div>
    </div>
    <div id="container"></div>
  </div>
</template>

<script lang="ts">
import { Vue, Component } from "vue-property-decorator";
import { editor, KeyMod, KeyCode } from "monaco-editor";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { ScriptCache } from "@App/apps/msg-center/event";
import query from "query-string";
import { ScriptUrlInfo } from "@App/apps/msg-center/structs";
import { ScriptManager } from "@App/apps/script/manager";
import { Script } from "@App/model/script";
import { Crontab } from "@App/apps/script/crontab";

@Component({})
export default class App extends Vue {
  protected editor!: editor.IStandaloneCodeEditor;
  protected diff!: editor.IStandaloneDiffEditor;
  public scriptUtil: ScriptManager = new ScriptManager(new Crontab(window));
  public script: Script = <Script>{};

  mounted() {
    this.createEdit();
    if (!this.$route.params.id) {
      return;
    }
    this.scriptUtil.getScript(parseInt(this.$route.params.id)).then(result => {
      if (result == undefined) {
        return;
      }
      this.script = result;
      this.editor.setValue(this.script.code);
    });
  }

  createEdit() {
    let edit = document.getElementById("container");
    if (edit == undefined) {
      return;
    }
    this.editor = editor.create(edit, {
      language: "javascript",
      folding: true,
      foldingStrategy: "indentation",
      automaticLayout: true,
      overviewRulerBorder: false,
      scrollBeyondLastLine: false
    });
    this.editor.addCommand(KeyMod.CtrlCmd | KeyCode.KEY_S, async () => {
      //TODO:保存时候错误处理
      let [script, _] = await this.scriptUtil.prepareScriptByCode(
        this.editor.getValue(),
        this.script.origin
      );
      if (script == undefined) {
        alert("脚本格式错误");
        return;
      }
      this.script.name = script.name;
      this.script.code = script.code;
      this.script.author = script.author;
      this.script.namespace = script.namespace;
      this.script.metadata = script.metadata;
      this.script.status = script.status;
      this.script.error = script.error;
      this.script.checktime = script.checktime;

      this.scriptUtil.updateScript(this.script);
    });
  }
}
</script>

<style>
#container {
  margin: 0;
  padding: 0;
  border: 0;
  width: 100%;
  height: 100%;
}
</style>
