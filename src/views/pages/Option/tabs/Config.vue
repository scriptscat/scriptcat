<template>
  <v-expansion-panels v-model="panel" multiple focusable>
    <v-expansion-panel v-for="(val, key) in configs" :key="key">
      <v-expansion-panel-header
        style="min-height: auto; font-size: 16px; font-weight: bold"
        >{{ key }}</v-expansion-panel-header
      >
      <v-expansion-panel-content>
        <div v-for="(val, key) in val.items" class="config-item" :key="key">
          <div v-if="val.type == 'select'">
            <div class="config-title">
              <span>{{ val.title }}:</span>
            </div>
            <div class="config-content">
              <v-select
                style="display: inline-block; width: 200px"
                v-model="val.value"
                :items="val.options"
                item-text="val"
                item-value="key"
                dense
                single-line
                @change="val.change(val)"
              >
              </v-select>
            </div>
          </div>
          <div v-else-if="val.type == 'check'">
            <div class="config-title">
              <input
                v-model="val.value"
                :id="val.title"
                @change="val.change(val)"
                type="checkbox"
              />
              <label :for="val.title" style="cursor: pointer">{{
                val.title
              }}</label>
            </div>
          </div>
          <div v-else-if="val.type == 'button'">
            <v-btn
              :color="val.color"
              @click="val.click"
              :loading="val.loading"
              style="color: #fff"
              small
              >{{ val.title }}</v-btn
            >
          </div>
        </div>
      </v-expansion-panel-content>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<script lang="ts">
import { UserController } from "@App/apps/user/controller";
import { SystemConfig } from "@App/pkg/config";
import { Vue, Component } from "vue-property-decorator";

@Component({})
export default class Config extends Vue {
  userCtl = new UserController();

  panel = [0, 1, 2, 3];

  configs = {
    同步与资源更新: {
      items: [
        {
          type: "check",
          value: SystemConfig.enable_auto_sync,
          title: "开启云同步",
          describe: "如果登录了账号会自动将数据同步到云,每半小时同步一次",
          change(val: any) {
            chrome.storage.local.get(["currentUser"], (items) => {
              if (!items["currentUser"]) {
                alert("请先点击右上角登录账号");
                return;
              }
              SystemConfig.enable_auto_sync = val.value;
            });
          },
        },
        {
          type: "button",
          title: "手动点击同步一次",
          color: "accent",
          loading: false,
          click: this.sync,
        },
        {
          type: "check",
          value: SystemConfig.update_disable_script,
          title: "更新已禁用脚本",
          describe: "禁用了的脚本也会检查更新",
          change(val: any) {
            SystemConfig.update_disable_script = val.value;
          },
        },
        {
          type: "select",
          value: { key: SystemConfig.check_script_update_cycle },
          title: "脚本/订阅检查更新间隔",
          describe: "每n秒检查一次脚本/订阅是否更新",
          options: [
            { key: 0, val: "从不" },
            { key: 21600, val: "6小时" },
            { key: 43200, val: "12小时" },
            { key: 86400, val: "每天" },
            { key: 604800, val: "每周" },
          ],
          change(val: any) {
            SystemConfig.check_script_update_cycle = val.value.key;
          },
        },
      ],
    },
  };

  async sync(val: any) {
    val.loading = true;
    let ret = await this.userCtl.sync();
    val.loading = false;
    alert(ret);
  }
}
</script>

<style scoped>
.config-item {
  margin-top: 10px;
  font-size: 14px;
}

.config-item .config-select {
  margin-top: 20px;
}

.config-item .config-title {
  display: inline-block;
  width: 200px;
}

.config-item .config-content {
  display: inline-block;
}
</style>
