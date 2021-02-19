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
import { editor } from "monaco-editor";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { ScriptCache } from "@App/apps/msg-center/event";
import query from "query-string";
import { ScriptUrlInfo } from "@App/apps/msg-center/structs";
import { Scripts } from "@App/apps/script/scripts";
import { Script } from "@App/model/script";

@Component({})
export default class App extends Vue {
  protected editor!: editor.IStandaloneCodeEditor;
  protected diff!: editor.IStandaloneDiffEditor;
  public scriptUtil: Scripts = new Scripts();
  public script: Script = <Script>{};

  mounted() {
    this.scriptUtil.getScript(parseInt(this.$route.params.id)).then(result => {
      if (result == undefined) {
        return;
      }
      this.script = result;
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
        scrollBeyondLastLine: false,
      });
      this.editor.setValue(this.script.code);
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
