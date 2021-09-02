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
          @initial-script="handleInitialSctipt"
          @save-script="handleSaveScript"
        />
      </TabPane>

      <TabPane title="META">
        <META :script="script" :metaBuffer="metaBuffer" @update-meta="handleUpdateMeta" />
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
  </div>
</template>

<script lang="ts">
import { Vue, Component, Prop } from "vue-property-decorator";

import { ScriptManager } from "@App/apps/script/manager";
import {
  Script,
  // Script,
  SCRIPT_ORIGIN_LOCAL,
  SCRIPT_STATUS_ENABLE,
} from "@App/model/do/script";

import eventBus from "@views/EventBus";
import { Tab, TabPane } from "@App/views/components/Tab";
import Config from "./Config.vue";
import META from "./META.vue";
import Editor from "./Editor.vue";
import Resource from "./Resource.vue";
import Storage from "./Storage.vue";
import { get } from "@App/pkg/utils";
import EventType from "../../EventType";
import { languages } from "monaco-editor";
import { scriptModule } from "../../store/script";
import { ScriptController } from "@App/apps/script/controller";

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

  scriptController: ScriptController = new ScriptController();

  @Prop() tabKey!: number | string;
  @Prop() scriptId!: number;
  script: Script = <Script>{};

  hasInitial = false;
  onMetaChange = false;

  metaBuffer: {
    grant?: { text: string; color: string }[];
    [key: string]: any[] | undefined;
  } = {};

  async handleInitialSctipt({}: IInitialScript) {
    if (!this.scriptId) {
      eventBus.$emit<IChangeTitle>(EventType.ChangeTitle, {
        title: "新建脚本",
        initial: true,
      });
      // scriptModule.changeTitle({});

      this.$refs.editor.hasInitial = true;

      return;
    }

    // todo scriptMgr似乎会缓存数据(缓存旧的script)，所以必须每次重新new一个
    // todo 或者修改一下scriptManager的实现，可以在外部控制是否缓存
    const scriptController: ScriptManager = new ScriptManager();
    const script = await scriptController.getScript(this.scriptId);

    if (!script) return;

    this.script = script;
    this.metaBuffer = this.prepareMetaBuffer(this.script.metadata);

    // scriptModule.changeTitle({
    //   title: script.name,
    //   scriptId: this.scriptId,
    // });

    eventBus.$emit<IChangeTitle>(EventType.ChangeTitle, {
      title: script.name,
      scriptId: this.scriptId,
    });

    this.hasInitial = true;
    // require自动补全
    this.script.metadata["definition"]?.forEach((val) => {
      this.handleDTs(val);
    });
  }

  async handleUpdateMeta({ code, name, metadata }: IUpdateMeta) {
    // 这里只更新了code
    this.script.code = code;
    this.script.name = name;
    // 更新脚本的metadata
    this.script.metadata = metadata;
    // 同步至indexDB
    await this.scriptController.update(this.script);

    // 保存成功后
    scriptModule.showSnackbar("config更新成功");
    // this.showSnackbar();
    this.onMetaChange = true;
    await this.handleInitialSctipt({} as any);
    this.onMetaChange = false;
  }

  async handleSaveScript({ currentCode, debug }: ISaveScript) {
    // todo 保存时候错误处理
    let [newScript, oldScript] = await this.scriptController.prepareScriptByCode(
      currentCode,
      this.script.origin || SCRIPT_ORIGIN_LOCAL + "://" + new Date().getTime()
    );

    if (newScript == undefined) {
      alert(oldScript);
      return;
    }

    let newScriptFlag = false;

    if (this.scriptId) {
      newScript.id = this.script.id;
    } else {
      newScriptFlag = true;
    }

    newScript.status = this.script.status || newScript.status;
    newScript.error = this.script.error;
    newScript.checkupdate_url = this.script.checkupdate_url;

    this.script = newScript;
    if (!oldScript) {
      // 新脚本默认开启
      this.script.status = SCRIPT_STATUS_ENABLE;
    }
    await this.scriptController.update(this.script);

    // 保存成功后

    console.log("脚本保存成功");
    if (debug) {
      scriptModule.showSnackbar(
        "脚本准备进入调试模式执行,请按F12打开开发者工具进行调试."
      );
      // 后台脚本才能调试
      let scriptCache = await this.scriptController.buildScriptCache(this.script);
      sandbox.postMessage(
        { action: "exec", data: scriptCache, value: scriptCache.value, isdebug: true },
        "*"
      );
    } else {
      scriptModule.showSnackbar("脚本保存成功");
    }
    await this.handleInitialSctipt({} as any);

    eventBus.$emit<IChangeTitle>(EventType.ChangeTitle, {
      title: `${this.script.name}`,
      initial: this.scriptId ? undefined : true,
      scriptId: this.scriptId,
    });

    this.$refs.editor.hasUnsavedChange = false;

    // 最后执行新建脚本相关的事件
    if (newScriptFlag) {
      // 由plus演变而来的tab中保存，此时script为新建的script，
      // 简单来说，就是id需要从IndexedDB中获取
      eventBus.$emit<INewScript>(EventType.NewScript, {
        scriptId: newScript.id,
      });
    }

    eventBus.$emit(EventType.UpdateScriptList);
  }

  handleDTs(val: string) {
    get(val, (resp) => {
      languages.typescript.javascriptDefaults.addExtraLib(resp, val);
    });
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
}
</script>
