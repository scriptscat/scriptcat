<template>
  <v-app>
    <v-app-bar color="#1296DB" dense dark>
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
          <v-switch
            :input-value="getStatusBoolean(script)"
            hide-details
            flat
            @change="changeStatus(script)"
            style="display: inline-block"
            :label="`开启` + (issub ? '订阅更新' : '脚本')"
          >
          </v-switch>
        </div>
        <div class="text-subtitle-2" v-if="script.metadata['author']">
          作者: {{ script.metadata["author"][0] }}
        </div>
        <div class="text-subtitle-2" v-if="desctiption">
          {{ label }}描述: {{ desctiption }}
        </div>
        <div class="text-subtitle-2" style="max-height: 110px; overflow: hidden">
          {{ issub ? "订阅地址:" : "脚本来源:" }}
          <span
            style="
              word-wrap: break-word;
              word-break: break-all;
              max-height: 66px;
              display: block;
              overflow-y: auto;
            "
            >{{ script.origin || script.url }}</span
          >
        </div>
        <div class="control d-flex justify-end" style="margin-bottom: 10px">
          <v-btn
            @click="install"
            :loading="installLoading"
            :disabled="installLoading"
            depressed
            small
            color="primary"
          >
            {{ isupdate ? "更新" + label : issub ? "订阅" : "安装脚本" }}
          </v-btn>
          <v-btn
            @click="closeWindow()"
            style="margin-left: 10px"
            depressed
            small
            color="error"
          >
            关闭
          </v-btn>
        </div>
        <div class="text-subtitle-1" style="color: red">
          请从合法的来源安装脚本!!!未知的脚本可能会侵犯您的隐私或者做出恶意的操作!!!
        </div>
      </div>
      <div class="justify-start" style="flex: 1">
        <div>
          <span class="text-subtitle-1 d-flex"
            ><span class="justify-start" style="flex: 1" v-if="version"
              >{{ label }}版本:{{ version }}</span
            ><span class="justify-start" style="flex: 1" v-if="isupdate && oldVersion"
              >当前版本:{{ oldVersion }}</span
            ></span
          >
        </div>
        <div v-if="match.length">
          <span class="text-subtitle-1" v-if="issub">本订阅将会安装以下脚本:</span>
          <span class="text-subtitle-1" v-else>脚本将在以下网站中运行:</span>
          <div class="text-subtitle-2 match">
            <p v-for="item in match" :key="item">{{ item }}</p>
          </div>
        </div>
        <div v-if="connect.length" style="color: #ff9000">
          <span v-if="issub" class="text-subtitle-1" style="color: red"
            >订阅系列脚本将获得以下地址的完整访问权限,请注意检查且确认!!!</span
          >
          <span v-else class="text-subtitle-1">脚本将获得以下地址的完整访问权限:</span>
          <div class="text-subtitle-2 match">
            <p v-for="item in connect" :key="item">
              {{ item }}
            </p>
          </div>
        </div>
        <div v-if="isCookie" style="margin-top: 6px">
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
import { Vue, Component } from 'vue-property-decorator';
import { editor } from 'monaco-editor';
import { ScriptUrlInfo } from '@App/apps/msg-center/structs';
import {
  Script,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
} from '@App/model/do/script';
import { ScriptController } from '@App/apps/script/controller';
import { nextTime } from '@App/views/pages/utils';
import { Subscribe } from '@App/model/do/subscribe';

@Component({})
export default class Index extends Vue {
  protected editor!: editor.IStandaloneCodeEditor;
  protected diff!: editor.IStandaloneDiffEditor;
  public scriptController: ScriptController = new ScriptController();
  public script: Script | Subscribe = <Script>{ metadata: {} };
  public version = '';
  public oldVersion = '';
  public connect: string[] = [];
  public match: string[] = [];
  public isCookie = false;
  public isupdate = false;
  public desctiption = '';
  protected label = '脚本';
  protected issub = false;

  nextTime = nextTime;

  async mounted() {
    let url = new URL(location.href);
    let uuid = url.searchParams.get('uuid');
    if (!uuid) {
      return;
    }
    this.load(await this.scriptController.getInstallInfo(uuid));
  }

  load(info: ScriptUrlInfo) {
    if (info.issub) {
      void this.userSubscribe(info);
      this.label = '订阅';
      this.issub = true;
    } else {
      void this.userScript(info);
    }
  }

  async userSubscribe(info: ScriptUrlInfo) {
    let [sub, oldsub] = await this.scriptController.prepareSubscribeByCode(
      info.code,
      info.url
    );
    if (sub == undefined) {
      alert(<string>oldsub);
      return;
    }
    this.script = sub;
    let edit = document.getElementById('container');
    if (edit == undefined) {
      return;
    }
    if (typeof oldsub == 'object') {
      this.diff = editor.createDiffEditor(edit, {
        enableSplitViewResizing: false,
        renderSideBySide: false,
        folding: true,
        foldingStrategy: 'indentation',
        automaticLayout: true,
        overviewRulerBorder: false,
        scrollBeyondLastLine: false,
        readOnly: true,
        diffWordWrap: 'off',
      });
      this.diff.setModel({
        original: editor.createModel(oldsub.code, 'javascript'),
        modified: editor.createModel(this.script.code, 'javascript'),
      });
      this.isupdate = true;
      this.oldVersion = oldsub.metadata['version'] && oldsub.metadata['version'][0];
      document.title = '更新订阅 - ' + this.script.name + ' - ScriptCat ';
    } else {
      this.editor = editor.create(edit, {
        language: 'javascript',
        folding: true,
        foldingStrategy: 'indentation',
        automaticLayout: true,
        overviewRulerBorder: false,
        scrollBeyondLastLine: false,
        readOnly: true,
      });
      this.editor.setValue(this.script.code);
      document.title = '安装订阅 - ' + this.script.name + ' - ScriptCat ';
    }
    if (this.script.metadata['description']) {
      this.desctiption = this.script.metadata['description'][0];
    }
    this.version = this.script.metadata['version'] && this.script.metadata['version'][0];
    this.connect = this.script.metadata['connect'] || [];
    this.match = this.script.metadata['scripturl'] || [];
  }

  async userScript(info: ScriptUrlInfo) {
    let [script, oldscript] = await this.scriptController.prepareScriptByCode(
      info.code,
      info.url
    );
    if (script == undefined) {
      alert(<string>oldscript);
      return;
    }
    this.script = script;
    let edit = document.getElementById('container');
    if (edit == undefined) {
      return;
    }
    if (typeof oldscript == 'object') {
      this.diff = editor.createDiffEditor(edit, {
        enableSplitViewResizing: false,
        renderSideBySide: false,
        folding: true,
        foldingStrategy: 'indentation',
        automaticLayout: true,
        overviewRulerBorder: false,
        scrollBeyondLastLine: false,
        readOnly: true,
        diffWordWrap: 'off',
      });
      this.diff.setModel({
        original: editor.createModel(oldscript.code, 'javascript'),
        modified: editor.createModel(this.script.code, 'javascript'),
      });
      this.isupdate = true;
      this.oldVersion = oldscript.metadata['version'] && oldscript.metadata['version'][0];
      document.title = '更新脚本 - ' + this.script.name + ' - ScriptCat ';
    } else {
      this.editor = editor.create(edit, {
        language: 'javascript',
        folding: true,
        foldingStrategy: 'indentation',
        automaticLayout: true,
        overviewRulerBorder: false,
        scrollBeyondLastLine: false,
        readOnly: true,
      });
      this.editor.setValue(this.script.code);
      document.title = '安装脚本 - ' + this.script.name + ' - ScriptCat ';
    }
    if (this.script.metadata['description']) {
      this.desctiption = this.script.metadata['description'][0];
    }
    this.version = script.metadata['version'] && script.metadata['version'][0];
    this.connect = script.metadata['connect'] || [];
    script.metadata['grant']?.forEach((val) => {
      if (val == 'GM_cookie') {
        this.isCookie = true;
      }
    });

    this.script.metadata['match']?.forEach((val) => {
      this.match.push(val);
    });

    this.script.metadata['include']?.forEach((val) => {
      this.match.push(val);
    });
  }

  installLoading = false;

  public async install() {
    if (!this.script || !this.script.name) {
      return;
    }
    this.installLoading = true;
    if (this.issub) {
      let id = await this.scriptController.subscribe(<Subscribe>this.script);
      if (id) {
        window.close();
      } else {
        alert('订阅失败!');
      }
      return;
    }
    let id = await this.scriptController.update(<Script>this.script);
    if (id) {
      window.close();
    } else {
      alert('安装失败!');
    }
  }

  getStatusBoolean(item: Script) {
    return item.status === SCRIPT_STATUS_ENABLE ? true : false;
  }

  changeStatus(item: Script) {
    if (item.status === SCRIPT_STATUS_ENABLE) {
      item.status = SCRIPT_STATUS_DISABLE;
    } else {
      item.status = SCRIPT_STATUS_ENABLE;
    }
  }

  closeWindow() {
    window.close();
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

.match {
  max-height: 100px;
  overflow-y: auto;
}

.match p {
  margin-bottom: 0px;
}
</style>
