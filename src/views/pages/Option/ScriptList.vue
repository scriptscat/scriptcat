<template>
  <div>
    <v-data-table
      :headers="headers"
      :items="scripts"
      sort-by="id"
      class="elevation-1"
      v-model="selected"
      :single-select="false"
      show-select
      hide-default-footer
      multi-sort
    >
      <template v-slot:top>
        <template v-if="selected.length">
          <v-container fluid>
            <v-row align="center" dense>
              <v-col align-self="center" cols="2">
                <v-select
                  :items="multipleActionTypes"
                  label="选择一个操作"
                  solo
                  hide-details
                ></v-select>
              </v-col>

              <v-col align-self="center" cols="2">
                <v-select
                  :items="multipleFilterTypes"
                  label="选择过滤方式"
                  solo
                  hide-details
                ></v-select>
              </v-col>

              <v-col align-self="center" cols="3">
                <v-text-field
                  label="过滤字段"
                  :rules="rules"
                  hide-details
                  loading
                  solo
                ></v-text-field>
              </v-col>

              <v-col
                align-self="center"
                :style="{ display: 'flex', justifyContent: 'flex-end' }"
              >
                <v-btn color="primary" large>应用批量操作</v-btn>
              </v-col>
            </v-row>
          </v-container>
        </template>
      </template>

      <template v-slot:[`item.status`]="{ item }">
        <v-switch
          :input-value="getStatusBoolean(item)"
          @change="changeStatus(item)"
        ></v-switch>
      </template>

      <template v-slot:[`item.version`]="{ item }">
        {{ item.metadata.version && item.metadata.version[0] }}
      </template>

      <template v-slot:[`item.site`]="{ item }">
        <span v-if="item.type === 1">
          {{ item.site }}
        </span>
        <span v-else>
          {{ $t("script.runStatus." + (item.runStatus || "complete")) }}
        </span>
      </template>

      <template v-slot:[`item.feature`]="{ item }">
        {{ item.metadata.grant && item.metadata.grant[0] }}
      </template>

      <template v-slot:[`item.origin`]="{ item }">
        {{ mapSiteToSiteIcon(item.origin) }}
      </template>

      <template v-slot:[`item.updatetime`]="{ item }">
        {{ mapTimeStampToHumanized(item.updatetime) }}
      </template>

      <template v-slot:[`item.actions`]="{ item }">
        <v-icon small class="mr-2" @click="editItem(item)"> mdi-pencil </v-icon>
        <v-icon small @click="deleteItem(item)"> mdi-delete </v-icon>
        <v-icon
          small
          @click="execScript(item)"
          v-if="item.type !== 1 && item.runStatus != 'running'"
        >
          mdi-play
        </v-icon>
        <v-icon
          small
          @click="stopScript(item)"
          v-else-if="item.type !== 1 && item.runStatus == 'running'"
        >
          mdi-stop
        </v-icon>
      </template>

      <template v-slot:no-data> 啊哦，还没有安装脚本 </template>
    </v-data-table>

    <v-dialog v-model="dialogDelete" max-width="500px">
      <v-card>
        <v-card-title
          class="headline"
          :style="{ display: 'grid', placeItems: 'center' }"
        >
          你确定要删除该脚本吗？
        </v-card-title>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="blue darken-1" text @click="closeDelete">取消</v-btn>
          <v-btn color="blue darken-1" text @click="deleteItemConfirm">
            确定
          </v-btn>
          <v-spacer></v-spacer>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts">
import { Vue, Component, Watch } from "vue-property-decorator";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import relativeTime from "dayjs/plugin/relativeTime";

import { ScriptManager } from "@App/apps/script/manager";
import {
  Script,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_STATUS_DISABLE,
} from "@App/model/do/script";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { ScriptRunStatusChange } from "@App/apps/msg-center/event";

import eventBus from "@App/views/EventBus";

dayjs.locale("zh-cn");
dayjs.extend(relativeTime);

@Component({})
export default class ScriptList extends Vue {
  scriptUtil: ScriptManager = new ScriptManager(undefined);
  protected scripts: Array<Script> = [];
  selected = [];

  multipleActionTypes = ["启用", "禁用", "导出", "更新", "重置", "删除"];
  multipleFilterTypes = [
    "自动",
    "@name",
    "@namespace",
    "@author",
    "@grant",
    "@include",
  ];

  dialogDelete = false;
  headers = [
    {
      text: "#",
      value: "id",
    },
    { text: "开启", value: "status" },
    { text: "名称", value: "name" },
    { text: "版本", value: "version" },
    { text: "应用至/运行状态", value: "site" },
    { text: "特性", value: "feature" },
    { text: "主页", value: "origin" },
    { text: "最后更新", value: "updatetime" },
    { text: "操作", value: "actions", sortable: false },
  ];
  desserts: any[] = [];
  editedIndex = -1;
  editedItem: any = {};
  defaultItem = {
    name: "",
    calories: 0,
    fat: 0,
    carbs: 0,
    protein: 0,
  };

  created() {
    // todo 监听脚本列表更新，自动同步最新(比如新建)
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

  execScript(item: Script) {
    this.scriptUtil.execScript(item, false);
  }

  stopScript(item: Script) {
    this.scriptUtil.stopScript(item, false);
  }

  mapSiteToSiteIcon(site: string) {
    return site.slice(0, 15);
  }

  mapFeatureToIcon(features: string[]) {}

  mapTimeStampToHumanized(timestamp: number) {
    return dayjs().to(dayjs(timestamp));
  }

  filterScripts() {}

  executeMutipleAction() {}

  editItem(item: Script) {
    eventBus.$emit<IEditScript>("edit-script", { scriptId: item.id });
    // this.routeTo(`/edit/${item.id}`);
  }

  routeTo(path: string) {
    this.$router.push(path);
  }

  deleteItem(item: any) {
    this.editedIndex = this.scripts.indexOf(item);
    this.editedItem = Object.assign({}, item);
    this.dialogDelete = true;
  }

  async deleteItemConfirm() {
    await this.scriptUtil.uninstallScript(this.editedItem);
    this.scripts.splice(this.editedIndex, 1);

    this.closeDelete();
  }

  closeDelete() {
    this.dialogDelete = false;
    this.$nextTick(() => {
      this.editedItem = Object.assign({}, this.defaultItem);
      this.editedIndex = -1;
    });
  }

  @Watch("dialogDelete")
  onDialogDeleteChange(val: string, oldVal: string) {
    val || this.closeDelete();
  }
}
</script>
