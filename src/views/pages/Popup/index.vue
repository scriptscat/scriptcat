<template>
  <v-app>
    <Tab :overflow="false">
      <TabPane title="已安装" :keepAlive="true">
        <v-expansion-panels>
          <v-expansion-panel
            v-for="script in scripts"
            :key="script.id"
            :style="{
              backgroundColor: getStatusBoolean(script) ? undefined : '#EEEEEE',
            }"
          >
            <v-expansion-panel-header>
              {{ script.name }}
            </v-expansion-panel-header>
            <v-expansion-panel-content>
              <v-switch
                :input-value="getStatusBoolean(script)"
                @change="changeStatus(script)"
              ></v-switch>

              <v-btn color="primary" @click="navigateToEditor(script)">
                编辑
              </v-btn>
              <!-- <div>BUG反馈</div> -->
            </v-expansion-panel-content>
          </v-expansion-panel>
        </v-expansion-panels>
      </TabPane>
      <TabPane title="后台"></TabPane>
      <TabPane title="其它">
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
      </TabPane>
    </Tab>
  </v-app>
</template>

<script lang="ts">
import { Vue, Component } from "vue-property-decorator";

import { Tab, TabPane } from "@App/views/components/Tab";

import { ScriptManager } from "@App/apps/script/manager";
import {
  Script,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_STATUS_DISABLE,
} from "@App/model/do/script";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { ScriptRunStatusChange } from "@App/apps/msg-center/event";

@Component({
  components: {
    Tab,
    TabPane,
  },
})
export default class Popup extends Vue {
  scriptUtil: ScriptManager = new ScriptManager(undefined);
  protected scripts: Array<Script> = [];

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
    // 监听script状态变更
    MsgCenter.listener(ScriptRunStatusChange, (param) => {
      for (let i = 0; i < this.scripts.length; i++) {
        if (this.scripts[i].id == param[0]) {
          this.scripts[i].runStatus = param[1];
          break;
        }
      }
    });
  }

  getStatusBoolean(item: Script) {
    return item.status === SCRIPT_STATUS_ENABLE ? true : false;
  }

  async changeStatus(item: Script) {
    if (item.status === SCRIPT_STATUS_ENABLE) {
      item.status = SCRIPT_STATUS_DISABLE;
    } else {
      item.status = SCRIPT_STATUS_ENABLE;
    }

    this.scriptUtil.updateScriptStatus(item.id, item.status);
  }

  navigateToEditor(script: Script) {
    const targetUrl = chrome.runtime.getURL(
      `options.html#/?target=editor&id=${script.id}`
    );

    chrome.tabs.create({ url: targetUrl });
  }
}
</script>

<style></style>
