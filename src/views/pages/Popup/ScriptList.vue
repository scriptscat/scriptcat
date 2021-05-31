<template>
  <v-expansion-panels accordion>
    <v-expansion-panel
      v-for="script in scripts"
      :key="script.id"
      :style="{
        backgroundColor: getStatusBoolean(script) ? undefined : '#EEEEEE',
      }"
    >
      <v-expansion-panel-header style="padding: 2px; min-height: 48px">
        <v-switch
          :input-value="getStatusBoolean(script)"
          :label="script.name"
          @click.stop
          hide-details
          flat
          @change="changeStatus(script)"
          style="margin: 0; flex: none"
        ></v-switch>
      </v-expansion-panel-header>
      <v-expansion-panel-content class="inner-pan" dense>
        <v-list
          dense
          flat
          :style="{
            backgroundColor: getStatusBoolean(script) ? undefined : '#EEEEEE',
            padding: 0,
          }"
        >
          <v-list-item-group v-if="script.type >= 2" multiple>
            <v-list-item @click="runScript(script)">
              <v-list-item-icon>
                <v-icon>mdi-play</v-icon>
              </v-list-item-icon>
              <v-list-item-content>
                <v-list-item-title v-text="`运行一次`"></v-list-item-title>
              </v-list-item-content>
            </v-list-item>
          </v-list-item-group>
          <v-list-item-group multiple>
            <v-list-item @click="navigateToEditor(script)">
              <v-list-item-icon>
                <v-icon>mdi-pencil</v-icon>
              </v-list-item-icon>
              <v-list-item-content>
                <v-list-item-title v-text="`编辑`"></v-list-item-title>
              </v-list-item-content>
            </v-list-item>
          </v-list-item-group>
        </v-list>
      </v-expansion-panel-content>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<script lang="ts">
import { ScriptManager } from "@App/apps/script/manager";
import {
  Script,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_TYPE_CRONTAB,
} from "@App/model/do/script";
import { Component, Prop, Vue, Watch } from "vue-property-decorator";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { ScriptRunStatusChange } from "@App/apps/msg-center/event";

@Component({})
export default class ScriptList extends Vue {
  scriptUtil: ScriptManager = new ScriptManager(undefined);

  @Prop({
    type: Array,
    required: true,
  })
  value!: Array<Script>;

  scripts: Array<Script> = this.value;

  @Watch("value")
  updataScript(newValue: any, oldValue: any) {
    this.scripts = this.value;
  }

  created() {
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

  runScript(script: Script) {
    this.scriptUtil.execScript(script, false);
  }
}
</script>
