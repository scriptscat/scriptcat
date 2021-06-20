<template>
  <v-app>
    <v-tabs
      background-color="#1296DB"
      dark
      grow
      v-model="tabs"
      style="flex: none"
    >
      <v-tabs-slider color="#81D4FA"></v-tabs-slider>
      <v-tab>运行脚本</v-tab>
      <v-tab>后台脚本</v-tab>
      <v-tab>其它</v-tab>
    </v-tabs>
    <v-tabs-items v-model="tabs">
      <v-tab-item>
        <ScriptList v-model="scripts" :menu="menu" />
      </v-tab-item>
      <v-tab-item>
        <ScriptList v-model="bgScripts" :menu="bgMenu" />
      </v-tab-item>
      <v-tab-item>
        <v-list>
          <v-list-item
            v-for="(item, index) in otherOptions"
            :key="index"
            link
            :href="item.route"
            target="_black"
          >
            <v-list-item-icon>
              <v-icon v-text="item.icon"></v-icon>
            </v-list-item-icon>
            <v-list-item-content>
              <v-list-item-title v-text="item.title"></v-list-item-title>
            </v-list-item-content>
          </v-list-item>
        </v-list>

        <v-icon v-text="'mdi-github'"></v-icon>
      </v-tab-item>
    </v-tabs-items>
  </v-app>
</template>

<script lang="ts">
import { Vue, Component } from "vue-property-decorator";
import { Tab, TabPane } from "@App/views/components/Tab";
import {
  Script,
  SCRIPT_TYPE_CRONTAB,
  SCRIPT_TYPE_BACKGROUND,
} from "@App/model/do/script";
import ScriptList from "./ScriptList.vue";
import {
  mdiGithub,
  mdiCogOutline,
  mdiMagnify,
  mdiFileOutline,
  mdiHelpCircleOutline,
} from "@mdi/js";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { RequestTabRunScript } from "@App/apps/msg-center/event";
import { ScriptController } from "@App/apps/script/controller";

@Component({
  components: {
    Tab,
    TabPane,
    ScriptList,
  },
})
export default class Popup extends Vue {
  scriptConrtoller: ScriptController = new ScriptController();
  protected scripts: Array<Script> = [];
  protected bgScripts: Array<Script> = [];

  menu: any = {};
  bgMenu: any = {};

  items = [{}];

  tabs = null;

  otherOptions: { title: string; icon: string; route: string }[] = [
    {
      title: "管理面板",
      icon: mdiCogOutline,
      route: "/options.html",
    },
    {
      title: "获取脚本",
      icon: mdiMagnify,
      route: "https://bbs.tampermonkey.net.cn/forum-2-1.html",
    },
    {
      title: "新建脚本",
      icon: mdiFileOutline,
      route: "/options.html#/?target=initial",
    },
    {
      title: "问题反馈",
      icon: mdiHelpCircleOutline,
      route: "https://github.com/scriptscat/scriptcat/issues",
    },
    {
      title: "Github",
      icon: mdiGithub,
      route: "https://github.com/scriptscat/scriptcat",
    },
  ];

  created() {
    chrome.tabs.query(
      { active: true, lastFocusedWindow: true },
      async (tabs) => {
        MsgCenter.sendMessage(
          RequestTabRunScript,
          {
            tabId: tabs[0].id,
            url: tabs[0].url,
          },
          (val) => {
            this.scripts = val.run;
            this.menu = val.runMenu || {};
            this.bgMenu = val.bgMenu || {};
            // 将有菜单的后台脚本,放到运行脚本中
            this.scriptConrtoller
              .scriptList((where) => {
                return where
                  .where("type")
                  .anyOf([SCRIPT_TYPE_BACKGROUND, SCRIPT_TYPE_CRONTAB]);
              })
              .then((result) => {
                this.bgScripts = result;
                let map = new Map();
                result.forEach((val) => {
                  map.set(val.id, val);
                });
                for (const id in this.bgMenu) {
                  this.scripts.push(map.get(parseInt(id)));
                  this.menu[id] = this.bgMenu[id];
                }
              });
          }
        );
      }
    );
  }
}
</script>

<style>
.inner-pan > * {
  padding: 0px;
  padding-left: 16px;
}
</style>
