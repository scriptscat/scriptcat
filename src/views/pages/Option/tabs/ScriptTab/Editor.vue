<template>
  <div
    :style="{
      display: 'flex',
      flexDirection: 'column',
    }"
  >
    <div>
      <v-menu
        v-for="[title, items] in Object.entries(menu)"
        :key="title"
        open-on-hover
        rounded="lg"
        offset-y
      >
        <template v-slot:activator="{ on, attrs }">
          <v-btn
            v-bind="attrs"
            v-on="on"
            color="rgb(128, 128, 128)"
            outlined
            text
            height="36"
          >
            {{ title }}
          </v-btn>
        </template>

        <v-list dense :width="100">
          <v-list-item v-for="(item, index) in items" :key="index" link>
            <template v-if="item.tooltip">
              <v-tooltip right>
                <template v-slot:activator="{ on, attrs }">
                  <v-list-item-title
                    @click="item.handler"
                    v-bind="attrs"
                    v-on="on"
                    :class="{
                      'disabled-action-title': item.disabled === true,
                    }"
                  >
                    {{ item.action }}
                  </v-list-item-title>
                </template>

                <span>{{ item.tooltip }}</span>
              </v-tooltip>
            </template>

            <template v-else>
              <v-list-item-title
                @click="item.handler"
                :class="{
                  'disabled-action-title': item.disabled === true,
                }"
              >
                {{ item.action }}
              </v-list-item-title>
            </template>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>

    <div class="sub-container">
      <ResizableEditor ref="resizableEditor" />
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from "vue-property-decorator";
import { KeyMod, KeyCode } from "monaco-editor";
import eventBus from "@views/EventBus";
import { Script } from "@App/model/do/script";

import ResizableEditor from "@components/ResizableEditor.vue";
import EventType from "@Option/EventType";

interface IEditorMenu {
  [title: string]: {
    action: string;
    handler: Function;
    tooltip?: string;
    disabled?: boolean;
  }[];
}

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

  menu: IEditorMenu = {
    文件: [
      { action: "导入", handler: () => {}, disabled: true },
      { action: "导出", handler: () => {}, disabled: true },
    ],
    操作: [
      { action: "运行", handler: () => {}, disabled: true },
      {
        action: "调试",
        handler: () => {
          console.log("菜单action");
        },
        tooltip: "调试后台脚本",
      },
    ],
  };

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

<style scoped>
.sub-container {
  position: absolute;
  top: 36px;
  height: calc(100% - 36px);
  width: 100%;
  overflow-y: auto;
}

.disabled-action-title {
  color: rgb(128, 128, 128);
  cursor: not-allowed;
}
</style>