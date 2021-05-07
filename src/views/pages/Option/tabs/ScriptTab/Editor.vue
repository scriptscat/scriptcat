<template>
  <ResizableEditor ref="resizableEditor" />
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from "vue-property-decorator";
import { KeyMod, KeyCode } from "monaco-editor";
import eventBus from "@views/EventBus";
import { Script } from "@App/model/do/script";

import ResizableEditor from "@components/ResizableEditor.vue";
import EventType from "@Option/EventType";

@Component({
  components: { ResizableEditor },
})
export default class CloseButton extends Vue {
  $refs!: {
    resizableEditor: ResizableEditor;
  };

  get editor() {
    return this.$refs.resizableEditor.editor;
  }

  @Prop() scriptId!: number;
  @Prop() script!: Script;
  // @Prop() hasInitial!: boolean;
  @Prop() onMetaChange!: boolean;

  hasInitial = false;
  hasUnsavedChange = false;

  @Watch("script")
  onScriptChange() {
    this.editor.setValue(this.script.code);

    if (!this.hasInitial) {
      this.hasInitial = true;
    }
  }

  async mounted() {
    this.initialEditor();
  }

  async initialEditor() {
    this.editor.onDidChangeModelContent(() => {
      console.log("code changed");

      if (this.hasInitial && !this.hasUnsavedChange) {
        if (!this.onMetaChange) {
          eventBus.$emit<ICodeChange>(EventType.CodeChange, {
            scriptId: this.scriptId,
          });
          this.hasUnsavedChange = true;
        }
      }
    });

    this.editor.addCommand(KeyMod.CtrlCmd | KeyCode.KEY_S, async () => {
      eventBus.$emit<ISave>(EventType.Save, {
        scriptId: this.scriptId,
        currentCode: this.editor.getValue(),
      });
    });

    eventBus.$emit<IInitialScript>("initial-script", {
      scriptId: this.scriptId,
    });
  }
}
</script>

<style>
</style>