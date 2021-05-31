<template>
  <v-app>
    <v-tabs
      background-color="#1296DB"
      center-active
      dark
      grow
      v-model="tabs"
      style="flex: 0"
    >
      <v-tabs-slider color="#81D4FA"></v-tabs-slider>
      <v-tab>运行脚本</v-tab>
      <v-tab>后台脚本</v-tab>
      <v-tab>其它</v-tab>
    </v-tabs>
    <v-tabs-items v-model="tabs">
      <v-tab-item>
        <ScriptList v-model="scripts" />
      </v-tab-item>
      <v-tab-item>
        <ScriptList v-model="bgScripts" />
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
              <v-list-item-title> {{ item.title }} </v-list-item-title>
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

import { ScriptManager } from "@App/apps/script/manager";
import {
  Script,
  SCRIPT_TYPE_CRONTAB,
  SCRIPT_TYPE_BACKGROUND,
} from "@App/model/do/script";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { ScriptRunStatusChange } from "@App/apps/msg-center/event";

import ScriptList from "./ScriptList.vue";

@Component({
  components: {
    Tab,
    TabPane,
    ScriptList,
  },
})
export default class Popup extends Vue {
  scriptUtil: ScriptManager = new ScriptManager(undefined);
  protected scripts: Array<Script> = [];
  protected bgScripts: Array<Script> = [];

  items = [{}];

  tabs = null;

  otherOptions: { title: string; icon: string; route: string }[] = [
    {
      title: "管理面板",
      icon: "mdi-cog-outline",
      route: "/options.html",
    },
    {
      title: "获取脚本",
      icon: "",
      route: "https://bbs.tampermonkey.net.cn/forum-2-1.html",
    },
    {
      title: "新建脚本",
      icon: "",
      route: "/options.html",
    },
    {
      title: "问题反馈",
      icon: "",
      route: "https://github.com/scriptscat/scriptcat/issues",
    },
    {
      title: "Github",
      icon: "mdi-github",
      route: "https://github.com/scriptscat/scriptcat",
    },
  ];

  created() {
    this.scriptUtil.scriptList(undefined).then((result) => {
      this.scripts = result;
    });
    this.scriptUtil
      .scriptList((where) => {
        return where
          .where("type")
          .anyOf([SCRIPT_TYPE_BACKGROUND, SCRIPT_TYPE_CRONTAB]);
      })
      .then((result) => {
        this.bgScripts = result;
      });
  }
}
</script>

<style>
.inner-pan > * {
  padding-top: 0px;
  padding-right: 0px;
  padding-bottom: 0px;
  padding-left: 16px;
}
</style>
