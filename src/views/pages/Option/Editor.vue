<template>
  <Tab>
    <TabPane title="编辑器" :keepAlive="true">
      <div
        :id="uniqueEditorId"
        :style="{
          margin: 0,
          padding: 0,
          border: 0,
          width: '100%',
          height: '100%',
        }"
      />
    </TabPane>
    <TabPane title="设置"></TabPane>
    <TabPane title="META">
      解析meta信息，可以直接通过此处的form编辑，编辑后，同步至脚本上
    </TabPane>
    <TabPane title="存储">GM_setValue GM_getValue</TabPane>
    <TabPane title="资源">cdn @require之类</TabPane>
    <TabPane title="运行日志"></TabPane>
  </Tab>
</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from "vue-property-decorator";
import { editor, KeyMod, KeyCode } from "monaco-editor";

import { ScriptManager } from "@App/apps/script/manager";
import { Script, SCRIPT_ORIGIN_LOCAL } from "@App/model/script";
import { Background } from "@App/apps/script/background";
import crontabTpl from "@App/template/crontab.tpl";

import eventBus from "../../EventBus";
import { Tab, TabPane } from "@App/views/components/Tab";

import { sleep } from "@App/utils/common";

@Component({
  components: {
    Tab,
    TabPane,
  },
})
export default class App extends Vue {
  @Prop() scriptId!: number;

  // 页面上存在多个editor实例时，contentKeyService会报错
  uniqueEditorId = `container${String(Math.random()).slice(2)}`;

  protected editor!: editor.IStandaloneCodeEditor;
  protected diff!: editor.IStandaloneDiffEditor;
  public scriptMgr: ScriptManager = new ScriptManager(new Background(window));
  public script: Script = <Script>{};

  async mounted() {
    await this.createEditor();

    if (!this.scriptId) {
      eventBus.$emit<IChangeTitle>("change-title", {
        title: "新建脚本",
        initial: true,
      });
      return;
    }

    const script = await this.scriptMgr.getScript(this.scriptId);

    if (!script) return;

    this.script = script;
    this.editor.setValue(script.code);

    eventBus.$emit("change-title", {
      title: script.name,
      scriptId: this.scriptId,
    });
  }

  hasUnsavedChange() {
    eventBus.$emit("change-title", {
      title: `${this.script.name} *`,
      scriptId: this.scriptId,
    });
  }

  async createEditor() {
    // const edit = document.querySelector("#container") as HTMLElement;

    let edit: HTMLElement | null = null;

    // tabPane的内容是动态加载的，当Editor mounted时，tabPane内部的元素，不一定已经mount
    // 有一个时间差
    for (let i = 0; i < 10; i++) {
      edit = document.querySelector(`#${this.uniqueEditorId}`);

      if (edit) {
        break;
      }

      await sleep(200);
    }

    if (!edit) {
      alert("未能加载编辑器");
      return;
    }

    this.editor = editor.create(edit, {
      language: "javascript",
      folding: true,
      foldingStrategy: "indentation",
      automaticLayout: true,
      overviewRulerBorder: false,
      scrollBeyondLastLine: false,
      value: crontabTpl,
    });

    this.editor.addCommand(KeyMod.CtrlCmd | KeyCode.KEY_S, async () => {
      //TODO:保存时候错误处理
      let [script, old] = await this.scriptMgr.prepareScriptByCode(
        this.editor.getValue(),
        this.script.origin || SCRIPT_ORIGIN_LOCAL + "://" + new Date().getTime()
      );

      if (script == undefined) {
        alert("脚本格式错误");
        return;
      }

      script.id = this.script.id;
      script.status = this.script.status || script.status;
      script.error = this.script.error;
      script.checkupdate_url = this.script.checkupdate_url;

      this.script = script;

      await this.scriptMgr.updateScript(this.script, old);

      if (old) {
        // 后台脚本才可以调用
        if (this.script.metadata["debug"] != undefined) {
          this.scriptMgr.execScript(this.script, true);
        }
      } else {
        // this.$router.push({ path: "/" });
      }
    });
  }
}
</script>


