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
import { editor } from "monaco-editor";

import { sleep } from "@App/pkg/utils";
import crontabTpl from "@App/template/crontab.tpl";

@Component({})
export default class ResizableEditor extends Vue {
  @Prop({ default: "javascript" }) language!: string;
  // todo 可以选择默认模板
  @Prop({ default: crontabTpl }) template!: string;

  // 页面上存在多个editor实例时，contentKeyService会报错
  uniqueEditorId = `container${String(Math.random()).slice(2)}`;

  public editor!: editor.IStandaloneCodeEditor;
  // protected diff!: editor.IStandaloneDiffEditor;

  async mounted() {
    await this.createEditor();

    window.addEventListener("resize", () => {
      // todo lodash debounce
      // 首先，外部容器需要允许overflow，外部容器是flex item时，需要再封装一层
      // 其次，需要隐藏外部容器自身的overflow(隐藏overflow和允许overflow是两件事)
      // 只有当外部容器隐藏overflow时，editor才会显示自己的scroll
      this.resizeContainer();
    });
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
      language: this.language,
      folding: true,
      foldingStrategy: "indentation",
      automaticLayout: true,
      overviewRulerBorder: false,
      scrollBeyondLastLine: false,
      value: this.template,
    });

    this.$nextTick(() => {
      this.resizeContainer();
    });
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
}
</script>
