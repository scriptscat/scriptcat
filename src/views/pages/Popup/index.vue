<template>
  <v-app>
    <v-app-bar color="#1296DB" dense dark app>
      <v-toolbar-title>ScriptCat</v-toolbar-title>

      <v-spacer></v-spacer>

      <!-- <v-switch color="#E1F5FE" hide-details></v-switch> -->

      <v-btn icon href="/options.html" target="_blank">
        <v-icon>{{ icons.mdiHome }}</v-icon>
      </v-btn>

      <v-badge
        v-if="oldNotice != notice"
        bottom
        color="#ffc03e"
        dot
        offset-x="10"
        offset-y="20"
      >
        <v-btn icon @click="showNotice">
          <v-icon>{{ icons.mdiMessage }}</v-icon>
        </v-btn>
      </v-badge>
      <v-btn v-else icon @click="showNotice">
        <v-icon>{{ icons.mdiMessage }}</v-icon>
      </v-btn>

      <v-menu bottom left>
        <template v-slot:activator="{ on, attrs }">
          <v-btn dark icon v-bind="attrs" v-on="on">
            <v-icon>{{ icons.mdiDotsVertical }}</v-icon>
          </v-btn>
        </template>

        <v-list>
          <v-list-item
            v-for="(item, i) in otherOptions"
            :key="i"
            link
            :href="item.route"
            target="_black"
            dense
          >
            <v-list-item-icon>
              <v-icon v-text="item.icon"></v-icon>
            </v-list-item-icon>
            <v-list-item-content>
              <v-list-item-title v-text="item.title"></v-list-item-title>
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-app-bar>
    <v-main>
      <v-container>
        <v-card
          id="notice"
          v-show="isShowNotice"
          style="position: absolute; z-index: 1000; width: 100%"
        >
          <v-card-title>通知</v-card-title>
          <v-card-text v-html="notice"> </v-card-text>
        </v-card>
        <v-expansion-panels v-model="panel" multiple>
          <v-expansion-panel>
            <v-expansion-panel-header>当前页运行脚本</v-expansion-panel-header>
            <v-expansion-panel-content>
              <ScriptList v-model="scripts" :menu="menu" />
            </v-expansion-panel-content>
          </v-expansion-panel>

          <v-expansion-panel>
            <v-expansion-panel-header>后台脚本</v-expansion-panel-header>
            <v-expansion-panel-content>
              <ScriptList v-model="bgScripts" :menu="bgMenu" />
            </v-expansion-panel-content>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-container>
    </v-main>
    <v-footer color="#1296DB" dense>
      <div class="d-flex justify-space-between" style="width: 100%">
        <span class="v-text d-flex" style="color: #fff"
          >当前版本: {{ version }} {{ isdebug ? "debug" : "" }}</span
        >
        <span
          v-if="remoteVersion == '' || version == remoteVersion"
          class="v-text d-flex"
          style="color: #fff"
          >已是最新版本</span
        >
        <a
          v-else
          class="v-text d-flex"
          style="color: #e3ff00; text-decoration: none"
          href="https://github.com/scriptscat/scriptcat/releases"
          target="_blank"
          >有新的版本</a
        >
      </div>
    </v-footer>
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
  mdiHome,
  mdiMessage,
  mdiDotsVertical,
  mdiGithub,
  mdiMagnify,
  mdiPlus,
  mdiBugOutline,
  mdiFileDocumentMultipleOutline,
} from "@mdi/js";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { RequestTabRunScript } from "@App/apps/msg-center/event";
import { ScriptController } from "@App/apps/script/controller";
import { ExtVersion } from "@App/apps/config";

@Component({
  components: {
    Tab,
    TabPane,
    ScriptList,
  },
})
export default class Popup extends Vue {
  icons = { mdiHome, mdiMessage, mdiDotsVertical };

  scriptConrtoller: ScriptController = new ScriptController();
  protected scripts: Array<Script> = [];
  protected bgScripts: Array<Script> = [];

  menu: any = {};
  bgMenu: any = {};

  items = [{}];

  tabs = null;

  version = ExtVersion;
  remoteVersion = "";
  isdebug = process.env.NODE_ENV == "development";

  panel = [0];

  otherOptions: { title: string; icon: string; route: string }[] = [
    {
      title: "新建脚本",
      icon: mdiPlus,
      route: "/options.html#/?target=initial",
    },
    {
      title: "获取脚本",
      icon: mdiMagnify,
      route: "https://scriptcat.org/",
    },
    {
      title: "Bug/问题反馈",
      icon: mdiBugOutline,
      route: "https://github.com/scriptscat/scriptcat/issues",
    },
    {
      title: "项目文档",
      icon: mdiFileDocumentMultipleOutline,
      route: "https://docs.scriptcat.org",
    },
    {
      title: "Github",
      icon: mdiGithub,
      route: "https://github.com/scriptscat/scriptcat",
    },
  ];

  notice = "";
  oldNotice = "";
  isShowNotice = false;

  showNotice() {
    this.isShowNotice = true;
    this.oldNotice = this.notice;
    chrome.storage.local.set({
      oldNotice: this.notice,
    });

    let target = <HTMLElement>document.querySelector("#notice");
    let h = (e: any) => {
      if (target != e.target && !target.contains(e.target)) {
        this.isShowNotice = false;
        document.body.removeEventListener("click", h);
      }
    };
    setTimeout(() => {
      document.body.addEventListener("click", h);
    }, 0);
  }

  created() {
    chrome.storage.local.get(["notice", "oldNotice", "version"], (items) => {
      this.notice = items["notice"];
      this.oldNotice = items["oldNotice"];
      if (this.notice === "") {
        this.notice = this.oldNotice;
      }
      this.remoteVersion = items["version"];
    });
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
