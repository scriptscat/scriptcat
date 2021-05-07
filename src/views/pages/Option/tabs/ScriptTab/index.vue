<template>
  <div
    :style="{
      height: '100%',
      flexGrow: 1,
      display: 'flex',
    }"
  >
    <Tab>
      <TabPane title="编辑器" :keepAlive="true">
        <Editor
          ref="editor"
          :script="script"
          :scriptId="scriptId"
          :onMetaChange="onMetaChange"
        />
      </TabPane>

      <TabPane title="META">
        <META :script="script" :metaBuffer="metaBuffer" />
      </TabPane>

      <TabPane title="设置">
        <Config />
      </TabPane>

      <TabPane title="存储">
        <Storage />
      </TabPane>

      <TabPane title="资源">
        <Resource />
      </TabPane>
    </Tab>

    <v-snackbar v-model="snackbar" color="success" top right>
      {{ snackbarInfo }}

      <template v-slot:action="{ attrs }">
        <v-btn color="pink" text v-bind="attrs" @click="snackbar = false">
          Close
        </v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from "vue-property-decorator";
import { editor, KeyMod, KeyCode } from "monaco-editor";

import { ScriptManager } from "@App/apps/script/manager";
import { Script, SCRIPT_ORIGIN_LOCAL } from "@App/model/do/script";
import { Background } from "@App/apps/script/background";
import crontabTpl from "@App/template/crontab.tpl";

import eventBus from "@views/EventBus";
import { Tab, TabPane } from "@App/views/components/Tab";
import Config from "./Config.vue";
import META from "./META.vue";
import Editor from "./Editor.vue";
import Resource from "./Resource.vue";
import Storage from "./Storage.vue";
import { sleep } from "@App/pkg/utils";
import EventType from "../../EventType";

const colors = ["green", "purple", "indigo", "cyan", "teal", "orange"];

function getRandomColor() {
  return colors[Math.floor(Math.random() * colors.length)];
}

@Component({
  components: {
    Tab,
    TabPane,
    Config,
    META,
    Editor,
    Resource,
    Storage,
  },
})
export default class ScriptTab extends Vue {
  $refs!: {
    editor: Editor;
  };

  @Prop() scriptId!: number;

  hasInitial = false;
  onMetaChange = false;
  async created() {
    eventBus.$on<IUpdateMeta>("update-meta", this.handleUpdateMeta);
    // eventBus.$on<void>("initial-script", this.handleInitialSctipt);
    eventBus.$on<ISave>("save", this.handleSave);
    eventBus.$on(EventType.CodeChange, this.handleCodeChange);

    await this.handleInitialSctipt();
  }

  script: Script = <Script>{};
  scriptMgr: ScriptManager = new ScriptManager(new Background(window));
  localScriptId: number | null = null;
  metaBuffer: {
    grant?: { text: string; color: string }[];
    [key: string]: any[] | undefined;
  } = {};

  async handleInitialSctipt() {
    if (!(this.scriptId || this.localScriptId)) {
      eventBus.$emit<IChangeTitle>("change-title", {
        title: "新建脚本",
        initial: true,
      });

      return;
    }

    // todo scriptMgr似乎会缓存数据(缓存旧的script)，所以必须每次重新new一个
    // todo 或者修改一下scriptManager的实现，可以在外部控制是否缓存
    const scriptMgr: ScriptManager = new ScriptManager(new Background(window));
    const script = await scriptMgr.getScript(
      this.scriptId ?? this.localScriptId
    );

    if (!script) return;

    this.script = script;
    this.metaBuffer = this.prepareMetaBuffer(this.script.metadata);

    eventBus.$emit<IChangeTitle>("change-title", {
      title: script.name,
      scriptId: this.scriptId ?? this.localScriptId,
    });

    this.hasInitial = true;
  }

  async handleUpdateMeta({ code, name, metadata }: IUpdateMeta) {
    // 这里只更新了code
    this.script.code = code;
    this.script.name = name;
    // 更新脚本的metadata
    this.script.metadata = metadata;
    // 同步至indexDB
    await this.scriptMgr.updateScript(this.script);

    // 保存成功后
    this.showSnackbar("config更新成功");
    this.onMetaChange = true;
    await this.handleInitialSctipt();
    this.onMetaChange = false;
  }

  async handleSave({ currentCode }: ISave) {
    // todo 保存时候错误处理
    let [newScript, oldScript] = await this.scriptMgr.prepareScriptByCode(
      currentCode,
      this.script.origin || SCRIPT_ORIGIN_LOCAL + "://" + new Date().getTime()
    );

    if (newScript == undefined) {
      alert("脚本格式错误");
      return;
    }

    console.log({ newScript });

    if (this.scriptId) {
      newScript.id = this.script.id;
    } else {
      // 由plus演变而来的tab中保存，此时script为新建的script，
      // 所以反而需要从newScript中取id
      this.localScriptId = newScript.id;
    }

    newScript.status = this.script.status || newScript.status;
    newScript.error = this.script.error;
    newScript.checkupdate_url = this.script.checkupdate_url;

    this.script = newScript;

    await this.scriptMgr.updateScript(this.script, oldScript);

    // 保存成功后
    this.showSnackbar("脚本保存成功");
    await this.handleInitialSctipt();

    // 还原unsavdChange状态的title
    eventBus.$emit<IChangeTitle>("change-title", {
      title: `${this.script.name}`,
      scriptId: this.scriptId ?? this.localScriptId,
    });

    if (oldScript) {
      // 后台脚本才可以调用
      if (this.script.metadata["debug"] != undefined) {
        this.scriptMgr.execScript(this.script, true);
      }
    } else {
      // this.$router.push({ path: "/" });
    }

    this.$refs.editor.hasUnsavedChange = false;
  }

  async handleCodeChange() {
    console.log(1331251223);
    if (this.hasInitial) {
      eventBus.$emit<IChangeTitle>(EventType.ChangeTitle, {
        title: `* ${this.script.name}`,
        scriptId: this.scriptId ?? this.localScriptId,
      });
    }
  }

  /** 从metadata中提取为适合form的格式 */
  prepareMetaBuffer(metaData: { [key: string]: string[] }) {
    const buffer: {
      grant?: { text: string; color: string }[];
      [key: string]: any[] | undefined;
    } = {};

    for (const [key, values] of Object.entries(metaData)) {
      // todo switch化
      if (["grant", "match", "connect", "require"].includes(key)) {
        const newValues = [];

        for (const value of values) {
          newValues.push({ text: value, color: getRandomColor() });
        }

        buffer[key] = newValues;
      } else if (key === "version") {
        buffer[key] = values[0].split(".");
      } else if (key === "compatible") {
        buffer[key] = values.map((item) => item.toLowerCase());
      } else {
        buffer[key] = values;
      }
    }

    return buffer;
  }

  snackbar = false;
  snackbarInfo = "";

  showSnackbar(message: string) {
    this.snackbar = true;
    this.snackbarInfo = message;
    setTimeout(() => {
      this.snackbar = false;
    }, 4000);
  }
}
</script>


