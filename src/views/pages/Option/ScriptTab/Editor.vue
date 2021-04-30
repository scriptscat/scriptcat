<template>
  <div
    id="containerWrapper"
    :style="{
      height: '100%',
      width: '100%',
      display: 'flex',
      flexGrow: 1,
      overflow: 'hidden',
    }"
  >
    <div
      :id="uniqueEditorId"
      :style="{
        margin: 0,
        padding: 0,
        border: 0,
        flexGrow: 1,
        border: '1px solid red',
      }"
    />
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from "vue-property-decorator";

@Component({})
export default class CloseButton extends Vue {
  // 页面上存在多个editor实例时，contentKeyService会报错
  uniqueEditorId = `container${String(Math.random()).slice(2)}`;

  protected editor!: editor.IStandaloneCodeEditor;
  protected diff!: editor.IStandaloneDiffEditor;
  public scriptMgr: ScriptManager = new ScriptManager(new Background(window));
  public script: Script = <Script>{};

  metaBuffer: {
    grant?: { text: string; color: string }[];
    [key: string]: any[] | undefined;
  } = {};
  snackbar = false;
  snackbarInfo = "";

  async mounted() {
    await this.createEditor();
    await this.initialSctipt();

    window.addEventListener("resize", () => {
      // todo lodash debounce
      // 首先，外部容器需要允许overflow，外部容器是flex item时，需要再封装一层
      // 其次，需要隐藏外部容器自身的overflow(隐藏overflow和允许overflow是两件事)
      // 只有当外部容器隐藏overflow时，editor才会显示自己的scroll
      this.resizeContainer();
    });
  }

  async initialSctipt() {
    if (!(this.scriptId || this.localScriptId)) {
      eventBus.$emit<IChangeTitle>("change-title", {
        title: "新建脚本",
        initial: true,
      });
      return;
    }

    const scriptMgr: ScriptManager = new ScriptManager(new Background(window));
    // todo scriptMgr似乎会缓存数据(缓存旧的script)，所以必须每次重新new一个
    // todo 或者修改一下scriptManager的实现，可以在外部控制是否缓存
    const script = await scriptMgr.getScript(
      this.scriptId ?? this.localScriptId
    );

    if (!script) return;

    this.script = script;
    this.editor.setValue(script.code);

    this.prepareMetaBuffer(this.script.metadata);

    eventBus.$emit<IChangeTitle>("change-title", {
      title: script.name,
      scriptId: this.scriptId ?? this.localScriptId,
    });

    this.hasInitial = true;
    this.hasUnsavedChange = false;
  }

  onEditorContentChange() {
    if (this.hasInitial && !this.hasUnsavedChange) {
      eventBus.$emit<IChangeTitle>("change-title", {
        title: `* ${this.script.name}`,
        scriptId: this.scriptId ?? this.localScriptId,
      });

      this.hasUnsavedChange = true;
    }
  }

  resizeContainer() {
    const editorElement = document.querySelector<HTMLDivElement>(
      `#${this.uniqueEditorId}`
    );

    const wrapper = document.querySelector("#containerWrapper");
    const tabContainer = document.querySelector(
      `section.tab-container div.${this.uniqueEditorId} `
    );
    if (!wrapper) {
      console.error("hasn't find the container wrapper");
      return;
    }

    if (!editorElement) return;

    const { height, width } = window.getComputedStyle(wrapper);

    console.log({ tabContainer, wrapper, editorElement, height, width });

    editorElement.style.height = height;
    this.editor.layout();
  }

  async createEditor() {
    let edit: HTMLElement | null = null;

    // tabPane的内容是动态加载的，
    // 当Editor mounted时，tabPane内部的元素，不一定已经mount，有一个时间差
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
      // todo 可以选择默认模板
      value: crontabTpl,
    });

    this.$nextTick(() => {
      this.resizeContainer();
    });

    this.editor.onDidChangeModelContent(() => {
      console.log("code changed");
      this.onEditorContentChange();
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

      console.log({ script });

      if (this.scriptId) {
        script.id = this.script.id;
      } else {
        // 由plus演变而来的tab中保存，此时script为新建的script，
        // 所以反而需要从script中取id
        this.localScriptId = script.id;
      }

      script.status = this.script.status || script.status;
      script.error = this.script.error;
      script.checkupdate_url = this.script.checkupdate_url;

      this.script = script;

      await this.scriptMgr.updateScript(this.script, old);

      // 保存成功后
      this.snackbar = true;
      this.snackbarInfo = "脚本保存成功";
      setTimeout(() => {
        this.snackbar = false;
      }, 4000);

      await this.initialSctipt();

      // 还原unsavdChange状态的title
      eventBus.$emit<IChangeTitle>("change-title", {
        title: `${this.script.name}`,
        scriptId: this.scriptId ?? this.localScriptId,
      });

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

<style>
</style>