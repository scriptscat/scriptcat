<template>
  <div
    :class="uniqueEditorId"
    :style="{
      height: '100%',
      flexGrow: 1,
      display: 'flex',
    }"
  >
    <Tab>
      <TabPane title="编辑器" :keepAlive="true">
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
      </TabPane>
      <TabPane title="设置"></TabPane>
      <TabPane title="META">
        <v-form v-model="valid">
          <v-container>
            <template v-if="metaBuffer">
              <div
                v-for="([key], index) in Object.entries(metaBuffer)"
                :key="index"
              >
                <template v-if="['name'].includes(key)">
                  <v-text-field
                    v-model="metaBuffer[key]"
                    :counter="10"
                    :label="key"
                    required
                  ></v-text-field>
                </template>
                <template v-else-if="['license'].includes(key)">
                  <v-select
                    v-model="metaBuffer[key]"
                    :items="licence"
                    label="license"
                  ></v-select>
                </template>
                <template v-else-if="['version'].includes(key)">
                  version
                  <v-row justify="center">
                    <v-col
                      cols="1"
                      v-for="(number, index) in metaBuffer[key]"
                      :key="index"
                    >
                      <v-text-field
                        v-model="metaBuffer[key][index]"
                        hide-details
                        type="number"
                        :style="{ width: '60px' }"
                      />
                    </v-col>
                  </v-row>
                </template>
                <template v-else-if="['run-at'].includes(key)">
                  <v-select
                    v-model="metaBuffer[key]"
                    :items="runAtHooks"
                    label="run-at"
                  ></v-select>
                </template>
                <template v-else-if="key.startsWith('description')">
                  <v-textarea
                    v-model="metaBuffer[key]"
                    name="input-7-1"
                    :label="key"
                    rows="1"
                    auto-grow
                  ></v-textarea>
                </template>
                <template v-else-if="['compatible'].includes(key)">
                  compatible
                  <v-row>
                    <v-checkbox
                      v-for="browser in browsers"
                      :key="browser"
                      v-model="metaBuffer[key]"
                      :label="browser"
                      :value="browser"
                    ></v-checkbox>
                  </v-row>
                </template>
                <template v-else-if="['grant'].includes(key)">
                  <v-combobox
                    v-model="metaBuffer[key]"
                    :items="grant"
                    label="grant"
                    multiple
                    chips
                  >
                    <template v-slot:selection="{ attrs, item, selected }">
                      <v-chip
                        v-bind="attrs"
                        :color="`${item.color} lighten-3`"
                        :input-value="selected"
                        label
                        small
                      >
                        <span class="pr-2">
                          {{ item.text }}
                        </span>
                      </v-chip>
                    </template>
                  </v-combobox>
                </template>
                <template v-else-if="['match'].includes(key)">
                  <v-combobox
                    v-model="metaBuffer[key]"
                    :filter="filter"
                    :hide-no-data="!search"
                    :items="items"
                    :search-input.sync="search"
                    hide-selected
                    label="match"
                    multiple
                    small-chips
                  >
                    <template v-slot:no-data>
                      <v-list-item>
                        <span class="subheading">Create</span>
                        <v-chip
                          :color="`${colors[nonce - 1]} lighten-3`"
                          label
                          small
                        >
                          {{ search }}
                        </v-chip>
                      </v-list-item>
                    </template>
                    <template
                      v-slot:selection="{ attrs, item, parent, selected }"
                    >
                      <v-chip
                        v-if="item === Object(item)"
                        v-bind="attrs"
                        :color="`${item.color} lighten-3`"
                        :input-value="selected"
                        label
                        small
                      >
                        <span class="pr-2">
                          {{ item.text }}
                        </span>
                        <v-icon small @click="parent.selectItem(item)">
                          close
                        </v-icon>
                      </v-chip>
                    </template>
                    <template v-slot:item="{ index, item }">
                      <v-text-field
                        v-if="editing === item"
                        v-model="editing.text"
                        autofocus
                        flat
                        background-color="transparent"
                        hide-details
                        solo
                        @keyup.enter="edit(index, item)"
                      ></v-text-field>
                      <v-chip
                        v-else
                        :color="`${item.color} lighten-3`"
                        dark
                        label
                        small
                      >
                        {{ item.text }}
                      </v-chip>
                      <v-spacer></v-spacer>
                      <v-list-item-action @click.stop>
                        <v-btn icon @click.stop.prevent="edit(index, item)">
                          <v-icon>{{
                            editing !== item ? "mdi-pencil" : "mdi-check"
                          }}</v-icon>
                        </v-btn>
                      </v-list-item-action>
                    </template>
                  </v-combobox>
                </template>

                <template v-else>
                  <v-text-field
                    v-model="metaBuffer[key]"
                    :counter="10"
                    :label="key"
                    required
                  ></v-text-field>
                </template>

                <!-- todo require 自动补全，比如输入jQuery，自动补全为cdn.jsdelivr.net下的最新版本 -->
              </div>
            </template>

            <v-btn color="success" @click="updateConfig()"> 更新设置 </v-btn>
          </v-container>
        </v-form>
      </TabPane>
      <TabPane title="存储">GM_setValue GM_getValue</TabPane>
      <TabPane title="资源">
        cdn @require之类

        <template v-if="script.metadata">
          <v-card v-for="source in script.metadata.require" :key="source">
            {{ source }}
          </v-card>
        </template>
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

import eventBus from "../../EventBus";
import { Tab, TabPane } from "@App/views/components/Tab";
import { sleep } from "@App/pkg/utils";

const colors = ["green", "purple", "indigo", "cyan", "teal", "orange"];

function getRandomColor() {
  return colors[Math.floor(Math.random() * colors.length)];
}

const grant = [
  "GM_setValue",
  "GM_getValue",
  "GM_setClipboard",
  "GM_xmlhttpRequest",
  "GMSC_xmlhttpRequest",
  "GM_notification",
  "GM_closeNotification",
  "GM_updateNotification",
  "GM_log",
  "CAT_setLastRuntime",
  "CAT_setRunError",
  "CAT_runComplete",
  "GM_cookie",
  "CAT_setProxy",
  "CAT_clearProxy",
  "unsafeWindow",
];

function formatConfigProperty(key: string, value: string) {
  return `// @${key.padEnd(20, " ")}${value}`;
}

@Component({
  components: {
    Tab,
    TabPane,
  },
})
export default class Editor extends Vue {
  @Prop() scriptId!: number;
  localScriptId: number | null = null;

  hasUnsavedChange = false;
  hasInitial = false;

  licence = ["MIT", "GPL-3.0", "Apache"];
  browsers = ["chrome", "safari", "edge", "ie"];
  runAtHooks = ["document-start", "document-end"];

  valid = false;

  grant = grant.map((text) => ({
    text,
    color: getRandomColor(),
  }));

  // demo
  activator = null;
  attach = null;
  colors = ["green", "purple", "indigo", "cyan", "teal", "orange"];
  editing = null;
  editingIndex = -1;
  items = [
    { header: "Select an option or create one" },
    {
      text: "Foo",
      color: "blue",
    },
    {
      text: "Bar",
      color: "red",
    },
  ];
  nonce = 1;
  menu = false;
  model = [
    {
      text: "Foo",
      color: "blue",
    },
  ];
  x = 0;
  search = null;
  y = 0;

  edit(index: number, item: any) {
    if (!this.editing) {
      this.editing = item;
      this.editingIndex = index;
    } else {
      this.editing = null;
      this.editingIndex = -1;
    }
  }

  filter(item: any, queryText: string, itemText: string) {
    if (item.header) return false;

    const hasValue = (val: any) => (val != null ? val : "");

    const text = hasValue(itemText);
    const query = hasValue(queryText);

    return (
      text.toString().toLowerCase().indexOf(query.toString().toLowerCase()) > -1
    );
  }

  @Watch("model")
  onModelChange(val: any[], prev: any[]) {
    if (val.length === prev.length) return;

    this.model = val.map((v: any) => {
      if (typeof v === "string") {
        v = {
          text: v,
          color: this.colors[this.nonce - 1],
        };

        this.items.push(v);

        this.nonce++;
      }

      return v;
    });
  }
  //__demo

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

  /** 从metadata中提取为适合form的格式 */
  prepareMetaBuffer(metaData: { [key: string]: string[] }) {
    const buffer: {
      grant?: { text: string; color: string }[];
      [key: string]: any[] | undefined;
    } = {};

    for (const [key, values] of Object.entries(metaData)) {
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

    this.metaBuffer = buffer;
  }

  /** 从form格式还原为metadata格式 */
  formatConfig() {
    const buffer: { [key: string]: string[] } = {};

    for (const [key, values] of Object.entries(this.metaBuffer)) {
      if (["grant", "match", "connect", "require"].includes(key)) {
        const castValues = values as { text: string; color: string }[];

        buffer[key] = castValues.map((value) => value.text);
      } else if (key === "version") {
        const castValues = values as string[];

        buffer[key] = [castValues.join(".")];
      } else {
        if (Array.isArray(values)) {
          buffer[key] = values;
        } else {
          // 如name，单选select(license)等
          const castValues = (values as unknown) as string;

          buffer[key] = [castValues];
        }
      }
    }

    return buffer;
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

  /** 同步META表单至code */
  async updateConfig() {
    // 提取不包含config的纯代码
    const oldCode = this.script.code;

    console.log(oldCode);
    const pureCode = new RegExp(`^.*?==/UserScript==(.*)$`, "ms").exec(
      oldCode
    )![1];
    console.log(pureCode);

    // 格式化当前表单
    const formattedConfig = this.formatConfig();
    console.log(formattedConfig);

    // const { name, ...rest } = formattedConfig;

    let result = "// ==UserScript==\n";

    for (const [key, values] of Object.entries(formattedConfig)) {
      for (const value of values) {
        result += formatConfigProperty(key, value) + "\n";
      }
    }

    result += "// ==/UserScript==";
    console.log(result);

    // 拼接新config和code
    const newCode = result + pureCode;

    // 这里只更新了code
    this.script.code = newCode;
    this.script.name = formattedConfig.name.flat()[0];
    // 更新脚本的metadata
    this.script.metadata = JSON.parse(JSON.stringify(formattedConfig));
    // 同步至indexDB
    await this.scriptMgr.updateScript(this.script);

    // 保存成功后
    this.snackbar = true;
    this.snackbarInfo = "config更新成功";
    setTimeout(() => {
      this.snackbar = false;
    }, 4000);

    await this.initialSctipt();
  }
}
</script>


