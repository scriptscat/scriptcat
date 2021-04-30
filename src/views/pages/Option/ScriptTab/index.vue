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
        <Editor />
      </TabPane>
      <TabPane title="设置">
        <Config />
      </TabPane>
      <TabPane title="META">
        <META />
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

import eventBus from "../../../EventBus";
import { Tab, TabPane } from "@App/views/components/Tab";
import Config from "./Config.vue";
import META from "./META.vue";
import Editor from "./Editor.vue";
import Resource from "./Resource.vue";
import Storage from "./Storage.vue";
import { sleep } from "@App/pkg/utils";

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
  @Prop() scriptId!: number;
  localScriptId: number | null = null;

  hasUnsavedChange = false;
  hasInitial = false;

  licence = ["MIT", "GPL-3.0", "Apache"];
  browsers = ["chrome", "safari", "edge", "ie"];
  runAtHooks = ["document-start", "document-end"];

  valid = false;

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

  
}
</script>


