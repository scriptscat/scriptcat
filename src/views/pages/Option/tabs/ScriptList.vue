<template>
  <div>
    <v-data-table
      :headers="headers"
      :items="scripts"
      :items-per-page="count"
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
                  v-model="multipleAction"
                  :items="multipleActionTypes"
                  label="选择一个操作"
                  solo
                  hide-details
                ></v-select>
              </v-col>

              <v-col align-self="center" cols="2">
                <v-select
                  v-model="multipleFilter"
                  :items="multipleFilterTypes"
                  label="选择过滤方式"
                  solo
                  hide-details
                ></v-select>
              </v-col>

              <v-col align-self="center" cols="3">
                <v-text-field
                  v-model="filterText"
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
                <v-btn color="primary" large @click="takeMultipleAction()">
                  应用批量操作
                </v-btn>
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
          <v-tooltip top>
            <template v-slot:activator="{ on, attrs }">
              <span v-bind="attrs" v-on="on">
                {{
                  $t("script.runStatus." + (item.runStatus || "complete"))
                }}</span
              >
            </template>
            <span v-if="item.type == 2">
              定时脚本,下一次运行时间:{{ nextTime(item) }}
            </span>
            <span v-else> 后台脚本,会在扩展开启时自动执行 </span>
          </v-tooltip>
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
        <span class="action-buttons">
          <v-icon small @click="editItem(item)"> mdi-pencil </v-icon>
          <v-icon small @click="deleteItem(item)"> mdi-delete </v-icon>
          <v-dialog
            v-if="item.config"
            transition="dialog-bottom-transition"
            max-width="600"
          >
            <template v-slot:activator="{ on, attrs }">
              <v-icon small @click="settingItem(item)" v-bind="attrs" v-on="on">
                mdi-settings
              </v-icon>
            </template>
            <template v-slot:default="dialog">
              <v-card>
                <v-toolbar color="primary" dark>
                  <v-toolbar-title>{{ item.name }} 配置</v-toolbar-title>
                  <v-spacer></v-spacer>
                  <v-toolbar-items>
                    <v-btn icon dark @click="dialog.value = false" right>
                      <v-icon>mdi-close</v-icon>
                    </v-btn>
                  </v-toolbar-items>
                </v-toolbar>
                <v-tabs v-model="configTab[item.name]">
                  <v-tab v-for="(group, name) in item.config" :key="name">
                    {{ name }}
                  </v-tab>
                </v-tabs>

                <v-tabs-items v-model="configTab[item.name]">
                  <v-tab-item v-for="(group, name) in item.config" :key="name">
                    <v-card style="padding: 10px">
                      <div v-for="(item, key) in group" :key="key">
                        <v-text-field
                          clearable
                          v-model="item.value"
                          v-if="item.type === 'text'"
                          :type="item.password ? 'password' : 'text'"
                          :label="item.title"
                          :hint="item.description"
                          :rules="[
                            () =>
                              !item.min ||
                              item.min <= item.value.length ||
                              item.title + '不能少于' + item.min + '个字符',
                            () =>
                              !item.max ||
                              item.max >= item.value.length ||
                              item.title + '不能多于' + item.max + '个字符',
                          ]"
                        >
                        </v-text-field>
                        <v-text-field
                          clearable
                          v-model="item.value"
                          v-else-if="item.type === 'number'"
                          :suffix="item.unit"
                          :label="item.title"
                          :hint="item.description"
                          :rules="[
                            () =>
                              !item.min ||
                              item.min <= item.value ||
                              item.title + '不能比' + item.min + '小',
                            () =>
                              !item.max ||
                              item.max >= item.value ||
                              item.title + '不能比' + item.max + '大',
                          ]"
                        >
                        </v-text-field>
                        <v-checkbox
                          hide-details
                          v-model="item.value"
                          color="success"
                          v-else-if="item.type === 'boolean'"
                          style="margin-top: 0; margin-bottom: 12px; padding: 0"
                        >
                          <template v-slot:label>
                            {{ item.title }}
                            <div
                              class="text--disabled"
                              style="font-size: 10px; padding-left: 10px"
                            >
                              {{ item.description }}
                            </div>
                          </template>
                        </v-checkbox>
                        <v-select
                          v-model="item.value"
                          v-else-if="item.type === 'select'"
                          :items="item.values"
                          :suffix="item.unit"
                          :label="item.title"
                          :hint="item.description"
                        >
                        </v-select>
                      </div>
                      <v-card-actions class="justify-end">
                        <v-btn
                          text
                          color="success"
                          @click="
                            saveUserConfig(item, name, () => {
                              dialog.value = false;
                            })
                          "
                          >保存</v-btn
                        >
                      </v-card-actions>
                    </v-card>
                  </v-tab-item>
                </v-tabs-items>
              </v-card>
            </template>
          </v-dialog>
          <v-icon
            v-if="item.type !== 1 && item.runStatus != 'running'"
            dense
            @click="execScript(item)"
          >
            mdi-play
          </v-icon>
          <v-icon
            v-else-if="item.type !== 1 && item.runStatus == 'running'"
            dense
            @click="stopScript(item)"
          >
            mdi-stop
          </v-icon>
        </span>
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

    <v-pagination
      v-if="length > 1"
      v-model="page"
      :length="length"
      :total-visible="7"
    ></v-pagination>
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
import { Page } from "@App/pkg/utils";
import { ValueModel } from "@App/model/value";
import { Value } from "@App/model/do/value";
import { AppEvent, ScriptValueChange } from "@App/apps/msg-center/event";
import { CronTime } from "cron";

dayjs.locale("zh-cn");
dayjs.extend(relativeTime);

const multipleActionTypes = [
  "启用",
  "禁用",
  "导出",
  "更新",
  "重置",
  "删除",
] as const;

@Component({})
export default class ScriptList extends Vue {
  scriptUtil: ScriptManager = new ScriptManager(undefined);
  protected scripts: Array<Script> = [];
  selected: Script[] = [];

  multipleAction: typeof multipleActionTypes[number] = "删除";
  multipleFilter = null;
  filterText = "";

  multipleActionTypes = multipleActionTypes;
  multipleFilterTypes = [
    "自动",
    "@name",
    "@namespace",
    "@author",
    "@grant",
    "@include",
  ];

  async takeMultipleAction() {
    // todo 使用filterType和filterText过滤
    const targets = this.selected;

    // 执行操作
    switch (this.multipleAction) {
      case "删除":
        for (const script of targets) {
          await this.scriptUtil.uninstallScript(script);
        }

        alert("批量删除成功");
        // todo 响应式scriptList
        break;
    }
  }

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

  page = 1;
  count = 20;
  length = 1;

  configTab = {};

  @Watch("page")
  onPageChange(newPage: number) {
    this.scriptUtil
      .scriptList(undefined, new Page(newPage, this.count))
      .then((result) => {
        this.scripts = result;
        this.handleScriptConfig(this.scripts);
      });
  }

  created() {
    // todo 监听脚本列表更新，自动同步最新(比如新建)
    // todo 目前的排序，是当前页的排序，而不是所有脚本的排序，实现为所有脚本
    this.scriptUtil.scriptList(undefined, new Page(1, 1000)).then((result) => {
      this.scripts = result;
      this.handleScriptConfig(this.scripts);
      // todo 为scriptList和logger实现直接访问dexie的count，而不是获取list之后再length，性能有点问题
      this.length = Math.ceil(result.length / this.count);
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

  protected valueModel = new ValueModel();

  handleScriptConfig(scripts: Script[]) {
    scripts.forEach((val) => {
      if (val.config) {
        for (const gkey in val.config) {
          let group = val.config[gkey];
          for (const key in group) {
            if (typeof group[key].default == "boolean") {
              group[key].type = "boolean";
            } else if (group[key].values) {
              group[key].type = "select";
            } else if (typeof group[key].default == "number") {
              group[key].type = "number";
            } else {
              group[key].type = "text";
            }
            let where: any = { key: gkey + "." + key };
            if (val.namespace) {
              where["namespace"] = val.namespace;
            } else {
              where["scriptId"] = val.id;
            }
            this.valueModel.findOne(where).then((val) => {
              // 读取value
              if (val) {
                group[key].value = val?.value;
              } else {
                group[key].value = group[key].default || "";
              }
            });
          }
        }
      }
    });
  }

  async saveUserConfig(script: Script, name: string, success: () => {}) {
    for (const itemKey in script.config![name]) {
      let item = script.config![name][itemKey];
      let key = name + "." + itemKey;
      let model: Value | undefined;
      if (script?.namespace) {
        model = await this.valueModel.findOne({
          namespace: script.namespace,
          key: key,
        });
      } else {
        model = await this.valueModel.findOne({
          scriptId: script?.id,
          key: key,
        });
      }
      if (model) {
        if (model.value == item.value) {
          continue;
        }
        model.value = item.value;
      } else {
        model = {
          id: 0,
          scriptId: script?.id || 0,
          namespace: script?.namespace || "",
          key: key,
          value: item.value,
          createtime: new Date().getTime(),
        };
      }
      this.valueModel.save(model);
      MsgCenter.connect(ScriptValueChange, model);
    }
    success();
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
    eventBus.$emit?.<IEditScript>("edit-script", { scriptId: item.id });
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

  settingItem(item: any) {}

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

  nextTime(script: Script): string {
    let oncePos = 0;
    let crontab = script.metadata!["crontab"][0];
    if (crontab.indexOf("once") !== -1) {
      let vals = crontab.split(" ");
      vals.forEach((val, index) => {
        if (val == "once") {
          oncePos = index;
        }
      });
      if (vals.length == 5) {
        oncePos++;
      }
    }
    let cron = new CronTime(crontab.replaceAll("once", "*"));
    if (oncePos) {
      switch (oncePos) {
        case 1: //每分钟
          return cron
            .sendAt()
            .add(1, "minute")
            .format("YYYY-MM-DD HH:mm 每分钟运行一次");
        case 2: //每小时
          return cron
            .sendAt()
            .add(1, "hour")
            .format("YYYY-MM-DD HH 每小时运行一次");
        case 3: //每天
          return cron.sendAt().add(1, "day").format("YYYY-MM-DD 每天运行一次");
        case 4: //每月
          return cron.sendAt().add(1, "month").format("YYYY-MM 每月运行一次");
        case 5: //每年
          return cron.sendAt().add(1, "year").format("YYYY 每年运行一次");
        case 6: //每星期
          return cron.sendAt().format("YYYY-MM-DD 每星期运行一次");
      }
      return "错误表达式";
    } else {
      return cron.sendAt().format("YYYY-MM-DD HH:mm:ss");
    }
  }
}
</script>

<style scoped>
.action-buttons {
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
}

.action-buttons .v-icon {
  margin-right: 5px;
}
</style>
