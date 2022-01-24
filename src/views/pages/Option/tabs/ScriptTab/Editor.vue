<template>
  <div
    :style="{
      display: 'flex',
      flexDirection: 'column',
    }"
  >
    <div style="padding-left: 6px; background: #e0e0e0">
      <v-menu
        v-for="[title, items] in Object.entries(menu)"
        :key="title"
        offset-y
      >
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
                <span>{{ item.action }}</span>
                <span v-if="item.keys">{{ item.keys }}</span>
              </v-list-item-title>
            </div>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>

    <div class="sub-container">
      <ResizableEditor
        ref="resizableEditor"
        :template="template"
        :param="param"
      />
    </div>
    <input type="file" id="fileInput" hidden accept=".js" />
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-property-decorator';
import { KeyMod, KeyCode, editor } from 'monaco-editor';
import { Script, SCRIPT_TYPE_NORMAL } from '@App/model/do/script';
import { mdiContentSave, mdiFileImport, mdiFileExport, mdiBug } from '@mdi/js';
import ResizableEditor from '@Components/ResizableEditor.vue';
import EventType from '@Option/EventType';
import eventBus from '@App/views/EventBus';

interface IEditorMenu {
  [title: string]: {
    action: string;
    handler: () => void;
    show?: boolean;
    disabled?: boolean;
    icon?: any;
    keys?: string;
  }[];
}

@Component({
  components: { ResizableEditor },
})
export default class Editor extends Vue {
  public $refs!: {
    resizableEditor: ResizableEditor;
  };

  get editor() {
    return <editor.IStandaloneCodeEditor>this.$refs.resizableEditor.editor;
  }

  @Prop() tabKey!: number | string;
  @Prop() scriptId!: number;
  @Prop() script!: Script;
  @Prop() template!: 'normal' | 'crontab' | 'background';
  @Prop() param?: AnyMap;

  @Prop() onMetaChange!: boolean;
  public hasInitial = false;
  public hasUnsavedChange = false;

  @Watch('script')
  onScriptChange(news: Script, old: Script) {
    if (old && news.id == old.id) {
      return;
    }
    this.editor.setValue(this.script.code);

    if (!this.hasInitial) {
      this.hasInitial = true;
    }
  }

  mounted() {
    void this.initialEditor();
    let fileInput = <HTMLInputElement>document.getElementById('fileInput');
    fileInput.addEventListener('change', () => {
      let file = fileInput.files?.[0];
      if (!file) {
        return;
      }
      let reader = new FileReader();
      let self = this;
      reader.onload = function () {
        self.editor.setValue(<string>this.result);
      };
      reader.readAsText(file, 'utf-8');
    });
  }

  initialEditor() {
    this.editor.onDidChangeModelContent(() => {
      if (this.hasInitial && !this.hasUnsavedChange) {
        // 修改meta会自动保存，或者不保存也行，统一交由用户决定(保存)
        if (!this.onMetaChange) {
          // scriptModule.changeTitle({
          //   scriptId: this.scriptId,
          //   title: `* ${this.script.name}`,
          // });

          eventBus.$emit<IChangeTitle>(EventType.ChangeTitle, {
            title: `* ${this.script.name ?? '新建脚本'}`,
            initial: this.scriptId ? undefined : true,
            scriptId: this.scriptId,
            tabKey: this.tabKey,
          });

          this.hasUnsavedChange = true;
        }
      }
    });

    this.editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => {
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
        action: '保存',
        handler: () => {
          this.$emit<ISaveScript>(EventType.SaveScript, {
            currentCode: this.editor.getValue(),
            debug: false,
          });
        },
        icon: mdiContentSave,
        keys: 'Ctrl+S',
      },
      {
        action: '导入',
        handler: () => {
          (<HTMLInputElement>document.getElementById('fileInput')).click();
        },
        icon: mdiFileImport,
      },
      {
        action: '导出',
        handler: () => {
          this.$emit<ISaveScript>(EventType.SaveScript, {
            currentCode: this.editor.getValue(),
            debug: false,
          });

          const blob = new Blob([this.editor.getValue()], {
            type: 'text/javascript',
          });
          const link = document.createElement('a');
          link.download = this.script.name + '.user.js';
          link.style.display = 'none';
          link.href = URL.createObjectURL(blob);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        },
        icon: mdiFileExport,
      },
    ],
    操作: [
      {
        action: '调试',
        show: this.script.type !== SCRIPT_TYPE_NORMAL,
        handler: () => {
          this.$emit<ISaveScript>(EventType.SaveScript, {
            currentCode: this.editor.getValue(),
            debug: true,
          });
        },
        icon: mdiBug,
        keys: '',
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
