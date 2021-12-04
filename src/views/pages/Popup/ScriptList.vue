<template>
  <v-expansion-panels accordion>
    <template v-if="!scripts.length">
      <span class="text-subtitle-1" style="margin-top: 10px">
        当前页没有可用脚本
      </span>
    </template>

    <template v-else>
      <v-expansion-panel
        v-for="(script, index) in scripts"
        :key="script.id"
        :style="{
          backgroundColor: getStatusBoolean(script) ? undefined : '#EEEEEE',
          paddingRight: '5px',
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
            :style="{
              margin: '0',
              padding: '0 5px',
              flex: 'none',
            }"
          ></v-switch>
        </v-expansion-panel-header>
        <div
          v-if="menu && menu[script.id]"
          class="inner-pan"
          style="padding-left: 16px"
        >
          <v-list dense flat style="padding: 0">
            <v-list-item-group multiple>
              <v-list-item
                v-for="(item, index) in menu[script.id]"
                :key="index"
                @click="menuClick(item)"
              >
                <v-list-item-icon>
                  <v-icon v-text="mdiConfig"></v-icon>
                </v-list-item-icon>
                <v-list-item-content>
                  <v-list-item-title
                    >{{ item.name }}({{ item.accessKey }})</v-list-item-title
                  >
                </v-list-item-content>
              </v-list-item>
            </v-list-item-group>
          </v-list>
        </div>
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
              <template v-if="script.runStatus === 'complete'">
                <v-list-item @click="scriptController.exec(script.id, false)">
                  <v-list-item-icon>
                    <v-icon>{{ icons.mdiPlay }}</v-icon>
                  </v-list-item-icon>
                  <v-list-item-content>
                    <v-list-item-title v-text="`运行一次`"></v-list-item-title>
                  </v-list-item-content>
                </v-list-item>
              </template>

              <template v-else>
                <v-list-item @click="scriptController.stop(script.id, false)">
                  <v-list-item-icon>
                    <v-icon>{{ icons.mdiStop }}</v-icon>
                  </v-list-item-icon>
                  <v-list-item-content>
                    <v-list-item-title v-text="`停止`"></v-list-item-title>
                  </v-list-item-content>
                </v-list-item>
              </template>
            </v-list-item-group>

            <v-list-item-group multiple>
              <v-list-item @click="navigateToEditor(script)">
                <v-list-item-icon>
                  <v-icon>{{ icons.mdiPencil }}</v-icon>
                </v-list-item-icon>
                <v-list-item-content>
                  <v-list-item-title v-text="`编辑`"></v-list-item-title>
                </v-list-item-content>
              </v-list-item>
              <v-list-item @click="deleteScript(index, script)">
                <v-list-item-icon>
                  <v-icon>{{ icons.mdiDelete }}</v-icon>
                </v-list-item-icon>
                <v-list-item-content>
                  <v-list-item-title v-text="`删除`"></v-list-item-title>
                </v-list-item-content>
              </v-list-item>
            </v-list-item-group>
          </v-list>
        </v-expansion-panel-content>
      </v-expansion-panel>
    </template>
  </v-expansion-panels>
</template>

<script lang="ts">
import {
  Script,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
} from "@App/model/do/script";
import { Component, Prop, Vue, Watch } from "vue-property-decorator";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import {
  ScriptRunStatusChange,
  TabMenuClick,
} from "@App/apps/msg-center/event";
import { mdiDelete, mdiPlay, mdiStop, mdiPencil } from "@mdi/js";
import { mdiCogOutline } from "@mdi/js";
import { ScriptController } from "@App/apps/script/controller";

@Component({})
export default class ScriptList extends Vue {
  icons = { mdiDelete, mdiPlay, mdiStop, mdiPencil };

  scriptController: ScriptController = new ScriptController();

  //TODO: 检测菜单快捷键
  mdiConfig = mdiCogOutline;

  @Prop({
    type: Array,
    required: true,
  })
  value!: Array<Script>;

  @Prop({ required: true })
  menu: any;

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
      this.scriptController.disable(item.id);
    } else {
      item.status = SCRIPT_STATUS_ENABLE;
      this.scriptController.enable(item.id);
    }
  }

  navigateToEditor(script: Script) {
    const targetUrl = chrome.runtime.getURL(
      `options.html#/?target=editor&id=${script.id}`
    );

    chrome.tabs.create({ url: targetUrl });
  }

  menuClick(item: any) {
    MsgCenter.connect(TabMenuClick, item);
    window.close();
  }

  deleteScript(index: number, item: Script) {
    this.scriptController.uninstall(item.id);
    this.scripts.splice(index, 1);
  }
}
</script>
