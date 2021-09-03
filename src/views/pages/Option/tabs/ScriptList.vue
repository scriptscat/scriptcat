<template>
  <div>
    <v-data-table
      :headers="headers"
      :items="scripts"
      sort-by="sort"
      :items-per-page="1000"
      :sort-desc="true"
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
        <v-tooltip top>
          <template v-slot:activator="{ on, attrs }">
            <div v-if="item.type == 1">
              <v-chip
                v-bind="attrs"
                v-on="on"
                class="ma-2"
                color="#5cbbf6"
                outlined
                label
                small
              >
                <v-icon left small>mdi-application</v-icon>
                页面脚本
              </v-chip>
            </div>
            <div v-else @click="showLog(item)" class="site">
              <v-chip
                v-bind="attrs"
                v-on="on"
                v-if="item.runStatus == 'running'"
                class="ma-2"
                color="primary"
                outlined
                label
                small
              >
                <v-progress-circular
                  :width="2"
                  :size="15"
                  indeterminate
                  color="primary"
                  style="margin-right: 4px"
                ></v-progress-circular>
                {{ $t("script.runStatus.running") }}
              </v-chip>
              <v-chip
                v-bind="attrs"
                v-on="on"
                v-else-if="item.runStatus == 'error'"
                class="ma-2"
                color="error"
                outlined
                label
                small
              >
                <v-icon
                  left
                  v-text="icons.mdiAlertCircleOutline"
                  small
                ></v-icon>
                {{ $t("script.runStatus.error") }}
              </v-chip>
              <v-chip
                v-bind="attrs"
                v-on="on"
                v-else-if="item.type != 1 && item.runStatus == 'complete'"
                class="ma-2"
                color="success"
                outlined
                label
                small
              >
                <v-icon
                  left
                  v-text="icons.mdiClockTimeFourOutline"
                  small
                ></v-icon>
                {{ $t("script.runStatus.complete") }}
              </v-chip>
            </div>
          </template>
          <span v-if="item.type == 2 && item.metadata['crontab']">
            定时脚本,下一次运行时间:{{ nextTime(item.metadata["crontab"][0]) }}
          </span>
          <span v-else-if="item.type == 3">
            后台脚本,会在扩展开启时自动执行
          </span>
          <span v-else-if="item.type == 1">
            前台页面脚本,会在指定的页面上运行
          </span>
        </v-tooltip>
      </template>

      <template v-slot:[`item.feature`]="{ item }">
        {{ item.metadata.grant && item.metadata.grant[0] }}
      </template>

      <template v-slot:[`item.sort`]="">
        <v-icon small style="cursor: pointer"> mdi-menu </v-icon>
      </template>

      <template v-slot:[`item.origin`]="{ item }">
        <v-tooltip bottom v-if="item.metadata['homepage']">
          <template v-slot:activator="{ on, attrs }">
            <v-icon
              dense
              @click="gotoLink(item.metadata['homepage'][0])"
              v-bind="attrs"
              v-on="on"
            >
              mdi-home
            </v-icon>
          </template>
          <span>脚本主页</span>
        </v-tooltip>

        <v-tooltip bottom v-if="item.metadata['homepageurl']">
          <template v-slot:activator="{ on, attrs }">
            <v-icon
              dense
              @click="gotoLink(item.metadata['homepageurl'][0])"
              v-bind="attrs"
              v-on="on"
            >
              mdi-home
            </v-icon>
          </template>
          <span>脚本主页</span>
        </v-tooltip>

        <v-tooltip bottom v-if="item.metadata['website']">
          <template v-slot:activator="{ on, attrs }">
            <v-icon
              dense
              @click="gotoLink(item.metadata['website'][0])"
              v-bind="attrs"
              v-on="on"
            >
              mdi-home
            </v-icon>
          </template>
          <span>脚本站点</span>
        </v-tooltip>

        <v-tooltip bottom v-if="item.metadata['source']">
          <template v-slot:activator="{ on, attrs }">
            <v-icon
              dense
              @click="gotoLink(item.metadata['source'][0])"
              v-bind="attrs"
              v-on="on"
            >
              mdi-code-tags
            </v-icon>
          </template>
          <span>脚本源码</span>
        </v-tooltip>

        <v-tooltip bottom v-if="item.metadata['supporturl']">
          <template v-slot:activator="{ on, attrs }">
            <v-icon
              dense
              @click="gotoLink(item.metadata['supporturl'][0])"
              v-bind="attrs"
              v-on="on"
            >
              mdi-bug
            </v-icon>
          </template>
          <span>BUG反馈/脚本支持站点</span>
        </v-tooltip>
      </template>

      <template v-slot:[`item.updatetime`]="{ item }">
        <v-progress-circular
          v-if="item.updatetime === -1"
          :size="20"
          :width="2"
          indeterminate
          color="primary"
        ></v-progress-circular>
        <span v-else-if="item.updatetime === -2" style="color: #ff6565"
          >有更新</span
        >
        <span v-else style="cursor: pointer" @click="checkUpdate(item)">
          {{ mapTimeStampToHumanized(item.updatetime) }}</span
        >
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
              <v-icon small v-bind="attrs" v-on="on"> mdi-settings </v-icon>
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
          <BgCloud
            v-if="item.type !== 1 && item.metadata['cloudcat']"
            :script="item"
          />
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

    <v-dialog
      v-model="showlog"
      transition="dialog-bottom-transition"
      max-width="600"
    >
      <template v-slot:default="dialog">
        <v-card>
          <v-toolbar color="primary" dark>
            <v-toolbar-title>{{ logScript.name }} 日志</v-toolbar-title>
            <v-spacer></v-spacer>
            <v-toolbar-items>
              <v-btn icon dark @click="dialog.value = false" right>
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </v-toolbar-items>
          </v-toolbar>
          <v-card-text
            id="log-show"
            style="margin-top: 10px; overflow-y: scroll; max-height: 520px"
          >
            <div v-for="(log, i) in logs" :key="i">
              {{ log.level }} {{ formatTime(log.createtime) }} -
              <div v-html="log.message" style="display: inline"></div>
            </div>
            <div class="d-flex justify-center" style="padding: 4px">
              <div>
                <v-progress-circular
                  indeterminate
                  size="20"
                  width="1"
                  color="primary"
                ></v-progress-circular>
                <span style="color: #1976d2; margin-left: 4px"
                  >等待日志...</span
                >
              </div>
            </div>
          </v-card-text>
          <v-divider></v-divider>
          <v-card-actions class="justify-end">
            <v-btn text color="error" @click="clearLog(logScript)"
              >清空日志</v-btn
            >
          </v-card-actions>
        </v-card>
      </template>
    </v-dialog>

    <span v-if="scripts.length" class="v-text" style="padding: 10px"
      >总脚本数量: {{ scripts.length }}</span
    >

    <v-btn
      style="position: absolute; right: 20px; bottom: 20px"
      color="#1296db"
      fab
      dark
      @click="newScript"
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>
  </div>
</template>

<script lang="ts">
import { Vue, Component, Watch } from "vue-property-decorator";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  Script,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_STATUS_DISABLE,
} from "@App/model/do/script";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { ListenGmLog, ScriptRunStatusChange } from "@App/apps/msg-center/event";

import eventBus from "@App/views/EventBus";
import { Page, AllPage } from "@App/pkg/utils";
import { nextTime } from "@App/views/pages/utils";
import { ValueModel } from "@App/model/value";
import { Value } from "@App/model/do/value";
import { ScriptValueChange } from "@App/apps/msg-center/event";
import EventType from "../EventType";
import { ScriptController } from "@App/apps/script/controller";
import { Log } from "@App/model/do/logger";

import { mdiClockTimeFourOutline, mdiAlertCircleOutline } from "@mdi/js";

import BgCloud from "@components/BgCloud.vue";
import { App } from "@App/apps/app";

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

@Component({
  components: { BgCloud },
})
export default class ScriptList extends Vue {
  scriptController: ScriptController = new ScriptController();
  protected scripts: Script[] = [];
  selected: Script[] = [];

  icons = {
    mdiClockTimeFourOutline: mdiClockTimeFourOutline,
    mdiAlertCircleOutline: mdiAlertCircleOutline,
  };

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

  rules = [];

  async takeMultipleAction() {
    // todo 使用filterType和filterText过滤
    const targets = this.selected;

    // 执行操作
    switch (this.multipleAction) {
      case "删除":
        for (const script of targets) {
          await this.scriptController.uninstall(script.id);
        }

        alert("批量删除成功");

        // 响应式scriptList
        eventBus.$emit(EventType.UpdateScriptList);

        break;
    }

    this.selected = [];
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
    { text: "排序", value: "sort", align: "center" },
    { text: "最后更新", value: "updatetime", width: 100, align: "center" },
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

  configTab = {};

  created() {
    // todo 监听脚本列表更新，自动同步最新(比如新建)
    // todo 目前的排序，是当前页的排序，而不是所有脚本的排序，实现为所有脚本
    this.scriptController
      .scriptList(undefined, new AllPage())
      .then(async (result) => {
        this.scripts = result;
        this.handleScriptConfig(this.scripts);
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

    // MsgCenter.listener(ScriptUpdate, () => {
    eventBus.$on(EventType.UpdateScriptList, () => {
      this.scriptController
        .scriptList(undefined, new AllPage())
        .then((result) => {
          this.scripts = result;
          this.handleScriptConfig(this.scripts);
        });
    });

    MsgCenter.connect(ListenGmLog, "init").addListener((msg) => {
      if (this.logScript && msg.scriptId == this.logScript.id && this.showlog) {
        this.logs.push({
          id: 0,
          level: msg.level,
          origin: "GM_log",
          title: this.logScript.name,
          message: msg.message,
          scriptId: msg.scriptId,
          createtime: new Date().getTime(),
        });
        let el = document.querySelector("#log-show");
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      }
    });
  }

  protected valueModel = new ValueModel();
  showlog = false;
  logs: Log[] = [];
  logScript?: Script;

  nextTime = nextTime;

  async showLog(item: Script) {
    this.logScript = item;
    this.logs = [];
    this.showlog = true;
    this.logs = await this.scriptController.getScriptLog(
      item.id,
      new Page(1, 20, "desc")
    );
    this.logs = this.logs.reverse();
    setTimeout(() => {
      let el = document.querySelector("#log-show");
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }, 1000);
  }

  async clearLog(item: Script) {
    await this.scriptController.clearLog(item.id);
    this.logs = [];
  }

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
      let ok = await this.scriptController.disable(item.id);
      if (ok) {
        item.status = SCRIPT_STATUS_DISABLE;
      }
    } else {
      let ok = await this.scriptController.enable(item.id);
      if (ok) {
        item.status = SCRIPT_STATUS_ENABLE;
      }
    }
  }

  execScript(item: Script) {
    this.scriptController.exec(item.id, false);
  }

  stopScript(item: Script) {
    this.scriptController.stop(item.id, false);
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

  async deleteItemConfirm() {
    await this.scriptController.uninstall(this.editedItem.id);
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

  async checkUpdate(item: Script) {
    let old = item.updatetime;
    item.updatetime = -1;
    let isupdate = await this.scriptController.check(item.id);
    if (isupdate) {
      item.updatetime = -2;
    } else {
      item.updatetime = old;
    }
  }

  formatTime(time: Date) {
    return dayjs(time).format("MM-DD HH:mm:ss");
  }

  gotoLink(link: string) {
    window.open(link, "_blank");
  }

  newScript() {
    eventBus.$emit<INewScript>(EventType.NewScript, { scriptId: 0 });
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

.site > .v-chip {
  cursor: pointer;
}
</style>
