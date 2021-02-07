<template>
  <div style="height: 100%">
    <div class="info">
      <div class="name">{{ script.name }}</div>
      <div class="control">
        <button @click="install">
          {{ isupdate ? "更新脚本" : "安装脚本" }}
        </button>
      </div>
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
  public isupdate: boolean = false;

  mounted() {
    let parsed = query.parse(location.search);
    if (!parsed["uuid"]) {
      return;
    }
    MsgCenter.connect(ScriptCache, parsed["uuid"]).addListener(async (msg) => {
      let info = <ScriptUrlInfo>msg;
      let [script, oldscript] = await this.scriptUtil.prepareScriptByCode(
        info.code,
        info.url
      );
      if (script == undefined) {
        return;
      }
      this.script = script;
      let edit = document.getElementById("container");
      if (edit == undefined) {
        return;
      }
      if (oldscript) {
        this.diff = editor.createDiffEditor(edit, {
          enableSplitViewResizing: false,
          renderSideBySide: false,
          folding: true,
          foldingStrategy: "indentation",
          automaticLayout: true,
          overviewRulerBorder: false,
          scrollBeyondLastLine: false,
          readOnly: true,
          diffWordWrap: "off",
        });
        this.diff.setModel({
          original: editor.createModel(this.script.code, "javascript"),
          modified: editor.createModel(oldscript.code, "javascript"),
        });
        this.isupdate = true;
      } else {
        this.editor = editor.create(edit, {
          language: "javascript",
          folding: true,
          foldingStrategy: "indentation",
          automaticLayout: true,
          overviewRulerBorder: false,
          scrollBeyondLastLine: false,
          readOnly: true,
        });
        this.editor.setValue(this.script.code);
      }
    });
  }

  public async install() {
    if (!this.script) {
      return;
    }
    let ok: boolean;
    if (this.isupdate) {
      ok = await this.scriptUtil.updateScript(this.script);
    } else {
      ok = await this.scriptUtil.installScript(this.script);
    }
    if (ok) {
      window.close();
    } else {
      alert("安装失败!");
    }
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
