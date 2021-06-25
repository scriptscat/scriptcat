<template>
  <v-app>
    <v-app-bar color="#1296DB" dense dark>
      <v-app-bar-nav-icon></v-app-bar-nav-icon>

      <v-toolbar-title>ScriptCat</v-toolbar-title>
      <v-spacer></v-spacer>
    </v-app-bar>
    <div class="d-flex">
      <div class="script-info justify-start" style="padding: 4px; flex: 1">
        <div class="text-h6">
          <v-avatar v-if="script.metadata['icon']" rounded size="30">
            <img :src="script.metadata['icon'][0]" />
          </v-avatar>
          {{ script.name }}
        </div>
        <div class="text-subtitle-2" v-if="script.metadata['author']">
          作者: {{ script.metadata["author"][0] }}
        </div>
        <div class="text-subtitle-2" v-if="desctiption">
          脚本描述: {{ desctiption }}
        </div>
        <div class="text-subtitle-2">安装来源: {{ script.origin }}</div>
        <div class="control d-flex justify-start" style="margin-bottom: 10px">
          <v-btn @click="install" depressed small color="primary">
            {{ isupdate ? "更新脚本" : "安装脚本" }}
          </v-btn>
          <v-btn
            @click="window.close()"
            style="margin-left: 10px"
            depressed
            small
            color="error"
          >
            关闭
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
        <div class="text-subtitle-1" style="color: red">
          请从合法的来源安装脚本!!!未知的脚本可能会侵犯您的隐私或者做出恶意的操作!!!
        </div>
      </div>
      <div class="justify-start" style="flex: 1">
        <div>
          <span class="text-subtitle-1 d-flex"
            ><span class="justify-start" style="flex: 1" v-if="version"
              >安装版本:{{ version }}</span
            ><span
              class="justify-start"
              style="flex: 1"
              v-if="isupdate && oldVersion"
              >当前版本:{{ oldVersion }}</span
            ></span
          >
        </div>
        <div v-if="match.length">
          <span class="text-subtitle-1">脚本将在以下网站中运行:</span>
          <div
            v-for="item in match"
            :key="item"
            class="text-subtitle-2"
            style="margin-right: 4px"
          >
            {{ item }}
          </div>
        </div>
        <div v-if="connect.length">
          <span class="text-subtitle-1" style="color: #ff9900"
            >脚本将获得以下地址的完整访问权限:</span
          >
          <span
            v-for="item in connect"
            :key="item"
            class="text-subtitle-2"
            style="margin-right: 4px; color: #ff9900"
          >
            {{ item }}
          </span>
        </div>
        <div v-if="isCookie" style="margin-top:6px">
          <span class="text-subtitle-1" style="color: red">
            请注意,本脚本会申请cookie的操作权限,这是一个危险的权限,请确认脚本的安全性.
          </span>
        </div>
      </div>
      <div class="justify-start" style="flex: 1">
        <div v-if="script.metadata['background']">
          <span class="text-subtitle-1">
            这是一个后台脚本,开启将会在浏览器打开时自动运行一次,也可以在面板中手动控制运行.</span
          >
        </div>
        <div v-if="script.metadata['crontab']">
          <span class="text-subtitle-1">
            这是一个定时脚本,开启将会在特点时间自动运行,也可以在面板中手动控制运行.</span
          >
          <div>
            <span class="text-subtitle-2">
              crontab表达式: {{ script.metadata["crontab"][0] }}</span
            >
          </div>
          <div>
            <span class="text-subtitle-2">
              最近一次运行时间:
              {{ nextTime(script.metadata["crontab"][0]) }}</span
            >
          </div>
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
import { ScriptController } from "@App/apps/script/controller";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { RequestInstallInfo } from "@App/apps/msg-center/event";
import { nextTime } from "@App/pkg/utils";

@Component({})
export default class Index extends Vue {
  protected editor!: editor.IStandaloneCodeEditor;
  protected diff!: editor.IStandaloneDiffEditor;
  public scriptController: ScriptController = new ScriptController();
  public script: Script = <Script>{ metadata: {} };
  public version: string = "";
  public oldVersion: string = "";
  public connect: string[] = [];
  public match: string[] = [];
  public isCookie: boolean = false;
  public isupdate: boolean = false;
  public desctiption = "";

  nextTime = nextTime;

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
    let i = 0;
    this.script.metadata["match"]?.forEach((val) => {
      if (this.match.length < 5) {
        this.match.push(val);
      }
      i++;
    });
    this.script.metadata["include"]?.forEach((val) => {
      if (this.match.length < 5) {
        this.match.push(val);
      }
      i++;
    });
    if (i > 5) {
      this.match.push("...");
    }
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
