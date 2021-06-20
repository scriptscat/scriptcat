<template>
  <v-app>
    <div class="d-flex">
      <div class="script-info justify-start" style="padding: 4px; flex: 1">
        <div class="text-h5">{{ script.name }}</div>
        <div class="text-subtitle-2" v-if="desctiption">
          {{ desctiption }}
        </div>
        <div class="text-subtitle-1" style="color: red">
          请从合法的来源安装脚本!!!未知的脚本可能会侵犯您的隐私或者做出恶意的操作!!!
        </div>
        <div class="control" style="margin-bottom: 10px">
          <v-btn @click="install" depressed color="primary">
            {{ isupdate ? "更新脚本" : "安装脚本" }}
          </v-btn>
          <v-switch
            :input-value="getStatusBoolean(script)"
            hide-details
            flat
            @change="changeStatus(script)"
            style="margin: 0; flex: none"
            label="开启脚本"
          >
          </v-switch>
        </div>
      </div>
      <div class="justify-start" style="flex: 1">
        <span class="text-subtitle-1 d-flex"
          ><span class="justify-start" style="flex: 1"
            >安装版本:{{ version }}</span
          ><span class="justify-start" style="flex: 1" v-if="isupdate"
            >当前版本:{{ oldVersion }}</span
          ></span
        >
        <div v-if="connect">
          <span class="text-subtitle-1">脚本将获得以下地址的完整访问权限:</span>
          <span
            v-for="item in connect"
            :key="item"
            class="text-subtitle-2"
            style="margin-right: 4px"
          >
            {{ item }}
          </span>
        </div>
        <div v-if="isCookie">
          <span class="text-subtitle-1" style="color: red">
            请注意,本脚本会申请cookie的操作权限,这是一个危险的权限,请确认脚本的安全性.
          </span>
        </div>
      </div>
    </div>
    <div id="container"></div>
  </v-app>
</template>

<script lang="ts">
import { Vue, Component } from "vue-property-decorator";
import { editor } from "monaco-editor";
import { ScriptUrlInfo } from "@App/apps/msg-center/structs";
import {
  Script,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
} from "@App/model/do/script";
import { Background } from "@App/apps/script/background";
import { App } from "@App/apps/app";
import { ScriptController } from "@App/apps/script/controller";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { RequestInstallInfo } from "@App/apps/msg-center/event";

@Component({})
export default class Index extends Vue {
  protected editor!: editor.IStandaloneCodeEditor;
  protected diff!: editor.IStandaloneDiffEditor;
  public scriptController: ScriptController = new ScriptController();
  public script: Script = <Script>{};
  public version: string = "";
  public oldVersion: string = "";
  public connect: string[] = [];
  public isCookie: boolean = false;
  public isupdate: boolean = false;
  public desctiption = "";

  mounted() {
    let url = new URL(location.href);
    let uuid = url.searchParams.get("uuid");
    if (!uuid) {
      return;
    }
    MsgCenter.sendMessage(RequestInstallInfo, uuid, (resp) => {
      if (resp) {
        this.load(resp);
      }
    });
  }

  async load(info: ScriptUrlInfo) {
    let [script, oldscript] = await this.scriptController.prepareScriptByCode(
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
      this.oldVersion =
        oldscript.metadata["version"] && oldscript.metadata["version"][0];
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
    if (this.script.metadata["description"]) {
      this.desctiption = this.script.metadata["description"][0];
    }
    this.version = script.metadata["version"] && script.metadata["version"][0];
    this.connect = script.metadata["connect"];
    script.metadata["grant"]?.forEach((val) => {
      if (val == "GM_cookie") {
        this.isCookie = true;
      }
    });
  }

  public async install() {
    if (!this.script) {
      return;
    }
    let id: number;
    id = await this.scriptController.update(this.script);
    if (id) {
      window.close();
    } else {
      alert("安装失败!");
    }
  }

  getStatusBoolean(item: Script) {
    return item.status === SCRIPT_STATUS_ENABLE ? true : false;
  }

  async changeStatus(item: Script) {
    if (item.status === SCRIPT_STATUS_ENABLE) {
      item.status = SCRIPT_STATUS_DISABLE;
    } else {
      item.status = SCRIPT_STATUS_ENABLE;
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
