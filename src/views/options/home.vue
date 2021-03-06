<template>
  <v-app>
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
          <!-- <v-toolbar flat> -->
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
          <!-- </v-toolbar> -->
        </template>
      </template>

      <!-- <v-toolbar-title>My CRUD</v-toolbar-title>
            <v-divider class="mx-4" inset vertical></v-divider>
            <v-spacer></v-spacer>
            <v-dialog v-model="dialog" max-width="500px">
              <template v-slot:activator="{ on, attrs }">
                <v-btn
                  color="primary"
                  dark
                  class="mb-2"
                  v-bind="attrs"
                  v-on="on"
                >
                  New Item
                </v-btn>
              </template>
              <v-card>
                <v-card-title>
                  <span class="headline">{{ formTitle }}</span>
                </v-card-title>

                <v-card-text>
                  <v-container>
                    <v-row>
                      <v-col cols="12" sm="6" md="4">
                        <v-text-field
                          v-model="editedItem.name"
                          label="Dessert name"
                        ></v-text-field>
                      </v-col>
                      <v-col cols="12" sm="6" md="4">
                        <v-text-field
                          v-model="editedItem.calories"
                          label="Calories"
                        ></v-text-field>
                      </v-col>
                      <v-col cols="12" sm="6" md="4">
                        <v-text-field
                          v-model="editedItem.fat"
                          label="Fat (g)"
                        ></v-text-field>
                      </v-col>
                      <v-col cols="12" sm="6" md="4">
                        <v-text-field
                          v-model="editedItem.carbs"
                          label="Carbs (g)"
                        ></v-text-field>
                      </v-col>
                      <v-col cols="12" sm="6" md="4">
                        <v-text-field
                          v-model="editedItem.protein"
                          label="Protein (g)"
                        ></v-text-field>
                      </v-col>
                    </v-row>
                  </v-container>
                </v-card-text>

                <v-card-actions>
                  <v-spacer></v-spacer>
                  <v-btn color="blue darken-1" text @click="close">
                    Cancel
                  </v-btn>
                  <v-btn color="blue darken-1" text @click="save"> Save </v-btn>
                </v-card-actions>
              </v-card>
            </v-dialog> -->

      <template v-slot:item.status="{ item }">
        <v-switch
          :value="getStatusBoolean(item)"
          @change="changeStatus(item)"
        ></v-switch>
      </template>

      <template v-slot:item.origin="{ item }">
        {{ mapSiteToSiteIcon(item.origin) }}
      </template>

      <template v-slot:item.updatetime="{ item }">
        {{ mapTimeStampToHumanized(item.updatetime) }}
      </template>

      <template v-slot:item.actions="{ item }">
        <v-icon small class="mr-2" @click="editItem(item)"> mdi-pencil </v-icon>
        <v-icon small @click="deleteItem(item)"> mdi-delete </v-icon>
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
  </v-app>
</template>

<script lang="ts">
import { Vue, Component, Watch } from "vue-property-decorator";
import { ScriptManager } from "@App/apps/script/manager";
import {
  Script,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_STATUS_DISABLE
} from "@App/model/script";

import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.locale("zh-cn");
dayjs.extend(relativeTime);

@Component({})
export default class App extends Vue {
  protected scripts: Array<Script> = [];
  protected scriptUtil: ScriptManager = new ScriptManager(undefined);
  selected = [];

  multipleActionTypes = ["启用", "禁用", "导出", "更新", "重置", "删除"];
  multipleFilterTypes = [
    "自动",
    "@name",
    "@namespace",
    "@author",
    "@grant",
    "@include"
  ];

  dialogDelete = false;
  headers = [
    {
      text: "#",
      value: "id"
    },
    { text: "开启", value: "status" },
    { text: "名称", value: "name" },
    { text: "版本", value: "version" },
    { text: "应用至", value: "site" },
    { text: "特性", value: "feature" },
    { text: "主页", value: "origin" },
    { text: "最后更新", value: "updatetime" },
    { text: "操作", value: "actions", sortable: false }
  ];
  desserts: any[] = [];
  editedIndex = -1;
  editedItem: any = {};
  defaultItem = {
    name: "",
    calories: 0,
    fat: 0,
    carbs: 0,
    protein: 0
  };

  created() {
    this.scriptUtil.scriptList(undefined).then(result => {
      this.scripts = result;
    });
  }

  getStatusBoolean(item: Script) {
    return item.status === SCRIPT_STATUS_ENABLE ? true : false;
  }

  changeStatus(item: Script) {
    if (item.status === SCRIPT_STATUS_ENABLE) {
      item.status = SCRIPT_STATUS_DISABLE;
    } else {
      item.status = SCRIPT_STATUS_ENABLE;
    }

    this.scriptUtil.updateScriptStatus(item.id, item.status);
  }

  mapSiteToSiteIcon(site: string) {
    return site.slice(0, 15);

    // return icon
  }

  mapTimeStampToHumanized(timestamp: number) {
    return dayjs().to(dayjs(timestamp));
  }

  filterScripts() {}

  executeMutipleAction() {}

  editItem(item: Script) {
    this.routeTo(`/edit/${item.id}`);
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
