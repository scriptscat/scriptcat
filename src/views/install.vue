<template>
  <div>
    <div id="editor"></div>
  </div>
</template>

<script lang="ts">
import { Vue, Component } from "vue-property-decorator";
import { editor } from "monaco-editor";
@Component({})
export default class App extends Vue {
  protected editor!: editor.IStandaloneCodeEditor;

  mounted() {
    let edit = document.getElementById("editor");
    console.log(edit);
    if (edit == null) {
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
  }
}
</script>

<style>
#editor {
  height: 80%;
  min-height: 600px;
}
</style>
