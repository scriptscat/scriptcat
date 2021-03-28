<template>
  <v-app>
    <div class="script-info">
      <div class="name">{{ script.name }}</div>
      <div style="color: red">
        请从合法的来源安装脚本!!!未知的脚本可能会侵犯您的隐私或者做出恶意的操作!!!
      </div>
      <div class="control">
        <v-btn @click="install" depressed color="primary">
          {{ isupdate ? "更新脚本" : "安装脚本" }}
        </v-btn>
      </div>
    </div>
    <div id="container"></div>
  </v-app>
</template>

<script lang="ts">
import { Vue, Component } from "vue-property-decorator";
import { editor } from "monaco-editor";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { ScriptCacheEvent } from "@App/apps/msg-center/event";
import { ScriptUrlInfo } from "@App/apps/msg-center/structs";
import { ScriptManager } from "@App/apps/script/manager";
import { Script } from "@App/model/script";
import { Background } from "@App/apps/script/background";

@Component({})
export default class App extends Vue {
  protected editor!: editor.IStandaloneCodeEditor;
  protected diff!: editor.IStandaloneDiffEditor;
  public scriptUtil: ScriptManager = new ScriptManager(new Background(window));
  public script: Script = <Script>{};
  public isupdate: boolean = false;

  mounted() {
    let url = new URL(location.href);
    let uuid = url.searchParams.get("uuid");
    if (!uuid) {
      return;
    }
    MsgCenter.connect(ScriptCacheEvent, uuid).addListener(async (msg) => {
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
          original: editor.createModel(oldscript.code, "javascript"),
          modified: editor.createModel(this.script.code, "javascript"),
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
