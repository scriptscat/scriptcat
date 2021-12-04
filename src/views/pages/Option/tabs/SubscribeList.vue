<template>
  <div>
    <v-data-table
      :headers="headers"
      :items="subscribes"
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
        <div v-for="(val, key) in item.metadata['connect']" :key="key">
          <img
            :src="'https://' + val + '/favicon.ico'"
            :alt="val"
            height="16"
            width="16"
          />
        </div>
      </template>

      <template v-slot:[`item.sort`]="">
        <v-icon small style="cursor: pointer"> {{ icons.mdiMenu }} </v-icon>
      </template>

      <template v-slot:[`item.origin`]="{ item }">
        <div @click="copyLink(item)">
          <v-tooltip top>
            <template v-slot:activator="{ on, attrs }">
              <v-chip
                v-bind="attrs"
                v-on="on"
                class="ma-2"
                color="primary"
                style="cursor: pointer"
                outlined
                label
                small
              >
                <v-icon left small>{{ icons.mdiLink }}</v-icon>
                订阅地址
              </v-chip>
            </template>
            <span>{{ item.url }} (点击复制)</span>
          </v-tooltip>
        </div>
      </template>

      <template v-slot:[`item.home`]="{ item }">
        <v-tooltip bottom v-if="item.metadata['homepage']">
          <template v-slot:activator="{ on, attrs }">
            <v-icon
              dense
              @click="gotoLink(item.metadata['homepage'][0])"
              v-bind="attrs"
              v-on="on"
            >
              {{ icons.mdiHome }}
            </v-icon>
          </template>
          <span>订阅主页</span>
        </v-tooltip>

        <v-tooltip bottom v-if="item.metadata['homepageurl']">
          <template v-slot:activator="{ on, attrs }">
            <v-icon
              dense
              @click="gotoLink(item.metadata['homepageurl'][0])"
              v-bind="attrs"
              v-on="on"
            >
              {{ icons.mdiHome }}
            </v-icon>
          </template>
          <span>订阅主页</span>
        </v-tooltip>

        <v-tooltip bottom v-if="item.metadata['website']">
          <template v-slot:activator="{ on, attrs }">
            <v-icon
              dense
              @click="gotoLink(item.metadata['website'][0])"
              v-bind="attrs"
              v-on="on"
            >
              {{ icons.mdiHome }}
            </v-icon>
          </template>
          <span>订阅站点</span>
        </v-tooltip>

        <v-tooltip bottom v-if="item.metadata['source']">
          <template v-slot:activator="{ on, attrs }">
            <v-icon
              dense
              @click="gotoLink(item.metadata['source'][0])"
              v-bind="attrs"
              v-on="on"
            >
              {{ icons.mdiCodeTags }}
            </v-icon>
          </template>
          <span>订阅元数据</span>
        </v-tooltip>

        <v-tooltip bottom v-if="item.metadata['supporturl']">
          <template v-slot:activator="{ on, attrs }">
            <v-icon
              dense
              @click="gotoLink(item.metadata['supporturl'][0])"
              v-bind="attrs"
              v-on="on"
            >
              {{ icons.mdiBug }}
            </v-icon>
          </template>
          <span>BUG反馈/支持站点</span>
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
          <v-icon small @click="deleteItem(item)">
            {{ icons.mdiDelete }}
          </v-icon>
        </span>
      </template>
      <template v-slot:no-data> 啊哦，还没有订阅过呢 </template>
    </v-data-table>

    <v-dialog v-model="dialogDelete" max-width="500px">
      <v-card>
        <v-card-title
          class="headline"
          :style="{ display: 'grid', placeItems: 'center' }"
        >
          你确定要删除该订阅吗,该订阅下的脚本也会同步删除?
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

    <span v-if="subscribes.length" class="v-text" style="padding: 10px"
      >总订阅数量: {{ subscribes.length }}</span
    >
  </div>
</template>

<script lang="ts">
import { BackgroundGrant } from "@App/apps/grant/background";
import { SyncTaskEvent } from "@App/apps/msg-center/event";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { ScriptController } from "@App/apps/script/controller";
import {
  Subscribe,
  SUBSCRIBE_STATUS_DISABLE,
  SUBSCRIBE_STATUS_ENABLE,
} from "@App/model/do/subscribe";

import { mdiHome, mdiCodeTags, mdiBug, mdiDelete, mdiLink } from "@mdi/js";
import dayjs from "dayjs";
import { Vue, Component } from "vue-property-decorator";
import { scriptModule } from "../store/script";

//TODO: 与脚本列表差不多,可以优化,使用同一个组件
@Component({})
export default class SubscribeList extends Vue {
  icons = { mdiHome, mdiLink, mdiCodeTags, mdiBug, mdiDelete };
  scriptController: ScriptController = new ScriptController();

  subscribes: Subscribe[] = [];
  selected: Subscribe[] = [];

  dialogDelete = false;

  headers = [
    {
      text: "#",
      value: "id",
    },
    { text: "开启", value: "status" },
    { text: "名称", value: "name" },
    { text: "版本", value: "version" },
    { text: "权限", value: "site" },
    { text: "来源", value: "origin" },
    { text: "主页", value: "home" },
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

  created() {
    // todo 监听脚本列表更新，自动同步最新(比如新建)
    // todo 目前的排序，是当前页的排序，而不是所有脚本的排序，实现为所有脚本
    this.scriptController.subscribeList(undefined).then(async (result) => {
      this.subscribes = result;
    });

    MsgCenter.listener(SyncTaskEvent, (msg) => {
      // 同步完成,刷新页面
      this.scriptController.subscribeList(undefined).then(async (result) => {
        this.subscribes = result;
      });
    });
  }

  getStatusBoolean(item: Subscribe) {
    return item.status === SUBSCRIBE_STATUS_ENABLE ? true : false;
  }

  deleteItem(item: any) {
    this.editedIndex = this.subscribes.indexOf(item);
    this.editedItem = Object.assign({}, item);
    this.dialogDelete = true;
  }

  async deleteItemConfirm() {
    await this.scriptController.unsubscribe(this.editedItem.id);
    this.subscribes.splice(this.editedIndex, 1);

    this.closeDelete();
  }

  closeDelete() {
    this.dialogDelete = false;
    this.$nextTick(() => {
      this.editedItem = Object.assign({}, this.defaultItem);
      this.editedIndex = -1;
    });
  }

  mapTimeStampToHumanized(timestamp: number) {
    return dayjs().to(dayjs(timestamp));
  }

  async changeStatus(item: Subscribe) {
    if (item.status === SUBSCRIBE_STATUS_ENABLE) {
      let ok = await this.scriptController.diableSubscribe(item.id);
      if (ok) {
        item.status = SUBSCRIBE_STATUS_DISABLE;
      }
    } else {
      let ok = await this.scriptController.enableSubscribe(item.id);
      if (ok) {
        item.status = SUBSCRIBE_STATUS_ENABLE;
      }
    }
  }

  async checkUpdate(item: Subscribe) {
    let old = item.updatetime;
    item.updatetime = -1;
    let isupdate = await this.scriptController.checkSubscribe(item.id);
    if (isupdate) {
      item.updatetime = -2;
    } else {
      item.updatetime = old;
    }
  }

  copyLink(item: Subscribe) {
    let msg = "订阅链接:" + item.url;
    BackgroundGrant.clipboardData = {
      data: msg,
    };
    document.execCommand("copy", false, <any>null);
    scriptModule.showSnackbar("复制成功");
  }
}
</script>
