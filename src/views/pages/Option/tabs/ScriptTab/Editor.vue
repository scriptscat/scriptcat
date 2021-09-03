<template>
  <div
    :style="{
      display: 'flex',
      flexDirection: 'column',
    }"
  >
    <div style="padding-left: 6px; background: #e0e0e0">
      <v-menu v-for="[title, items] in Object.entries(menu)" :key="title" offset-y>
        <template v-slot:activator="{ on, attrs }">
          <v-btn
            v-bind="attrs"
            v-on="on"
            color="rgb(88, 88, 88)"
            outlined
            style="border-color: #e0e0e0"
            tile
            text
            small
            height="30"
          >
            {{ title }}
          </v-btn>
        </template>
        <v-list dense>
          <v-list-item
            v-for="(item, index) in items"
            :key="index"
            link
            style="min-height: 0; max-width: 210px"
            @click="item.handler"
          >
            <div v-if="item.show !== false" style="display: flex">
              <v-list-item-icon style="margin-right: 8px">
                <v-icon v-text="item.icon" style="margin: 0"></v-icon>
              </v-list-item-icon>
              <v-list-item-title
                :class="{
                  'disabled-action-title': item.disabled === true,
                  'd-flex': true,
                  'justify-space-between': true,
                }"
                style="width: 300px"
              >
                <span>{{ item.action }} </span>
                <span v-if="item.keys">{{ item.keys }}</span>
              </v-list-item-title>
            </div>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>

    <div class="sub-container">
      <ResizableEditor ref="resizableEditor" />
    </div>
    <input type="file" id="fileInput" hidden accept=".js" />
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from "vue-property-decorator";
import { KeyMod, KeyCode, languages } from "monaco-editor";
import { Script, SCRIPT_TYPE_NORMAL } from "@App/model/do/script";

import ResizableEditor from "@components/ResizableEditor.vue";
import EventType from "@Option/EventType";
import { scriptModule } from "../../store/script";
import eventBus from "@App/views/EventBus";
import { createSandboxContext } from "@App/pkg/sandbox";

interface IEditorMenu {
  [title: string]: {
    action: string;
    handler: Function;
    show?: boolean;
    disabled?: boolean;
    icon?: any;
    keys?: string;
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

  @Prop() onMetaChange!: boolean;
  hasInitial = false;
  hasUnsavedChange = false;

  @Watch("script")
  onScriptChange(news: Script, old: Script) {
    if (old && news.id == old.id) {
      return;
    }
    this.editor.setValue(this.script.code);

    if (!this.hasInitial) {
      this.hasInitial = true;
    }
  }

  async mounted() {
    this.initialEditor();
    let fileInput = <HTMLInputElement>document.getElementById("fileInput");
    fileInput!.addEventListener("change", () => {
      var file = fileInput!.files![0];
      var reader = new FileReader();
      let _this = this;
      reader.onload = function () {
        _this.editor.setValue(<string>this.result);
      };
      reader.readAsText(file, "utf-8");
    });
  }

  async initialEditor() {
    this.editor.onDidChangeModelContent(() => {
      if (this.hasInitial && !this.hasUnsavedChange) {
        // 修改meta会自动保存，或者不保存也行，统一交由用户决定(保存)
        if (!this.onMetaChange) {
          // scriptModule.changeTitle({
          //   scriptId: this.scriptId,
          //   title: `* ${this.script.name}`,
          // });

          eventBus.$emit<IChangeTitle>(EventType.ChangeTitle, {
            title: `* ${this.script.name}`,
            initial: this.scriptId ? undefined : true,
            scriptId: this.scriptId,
          });

          this.hasUnsavedChange = true;
        }
      }
    });

    this.editor.addCommand(KeyMod.CtrlCmd | KeyCode.KEY_S, async () => {
      this.$emit<ISaveScript>(EventType.SaveScript, {
        currentCode: this.editor.getValue(),
        debug: false,
      });
    });

    this.$emit<IInitialScript>(EventType.InitialScript, {
      scriptId: this.scriptId,
    });
  }

  menu: IEditorMenu = {
    文件: [
      {
        action: "保存",
        handler: () => {
          this.$emit<ISaveScript>(EventType.SaveScript, {
            currentCode: this.editor.getValue(),
            debug: false,
          });
        },
        icon: "mdi-content-save",
        keys: "Ctrl+S",
      },
      {
        action: "导入",
        handler: () => {
          document.getElementById("fileInput")!.click();
        },
        icon: "mdi-file-import",
      },
      {
        action: "导出",
        handler: () => {
          this.$emit<ISaveScript>(EventType.SaveScript, {
            currentCode: this.editor.getValue(),
            debug: false,
          });

          const blob = new Blob([this.editor.getValue()], {
            type: "text/javascript",
          });
          const link = document.createElement("a");
          link.download = this.script.name + ".user.js";
          link.style.display = "none";
          link.href = URL.createObjectURL(blob);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        },
        icon: "mdi-file-export",
      },
    ],
    操作: [
      {
        action: "调试",
        show: this.script.type !== SCRIPT_TYPE_NORMAL,
        handler: () => {
          this.$emit<ISaveScript>(EventType.SaveScript, {
            currentCode: this.editor.getValue(),
            debug: true,
          });
        },
        icon: "mdi-bug",
        keys: "",
      },
    ],
  };
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
