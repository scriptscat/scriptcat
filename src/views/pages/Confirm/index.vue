<template>
  <v-app style="overflow: hidden">
    <v-app-bar
      color="#1296DB"
      style="position: unset"
      dense
      dark
      extension-height
    >
      <v-toolbar-title>ScriptCat</v-toolbar-title>
      <v-spacer></v-spacer>
    </v-app-bar>
    <v-main style="height: 100%; padding: 6px">
      <div class="text-h6">{{ param.title }}</div>
      <div v-for="(val, key) in param.metadata" :key="key">
        <span class="text-subtitle-1 font-weight-medium">{{
          key + ":" + val
        }}</span>
      </div>
      <div class="text-h6">{{ param.describe }}</div>
      <v-btn @click="ignore" color="secondary">忽略({{ timeout }}秒)</v-btn>
      <div>
        <v-btn @click="allow(true, 1)" color="primary">允许一次</v-btn>
        <v-btn @click="allow(true, 3)" color="primary">
          临时允许此{{ param.permissionContent }}
        </v-btn>
        <v-btn v-if="param.wildcard" @click="allow(true, 2)" color="primary"
          >临时允许全部{{ param.permissionContent }}</v-btn
        >
        <v-btn @click="allow(true, 5)" color="primary">
          总是允许此{{ param.permissionContent }}
        </v-btn>
        <v-btn
          v-if="param.wildcard && num > 2"
          @click="allow(true, 4)"
          color="warning"
        >
          总是允许全部{{ param.permissionContent }}
        </v-btn>
      </div>

      <div style="margin-top: 4px">
        <v-btn @click="allow(false, 1)" color="error">拒绝一次</v-btn>
        <v-btn @click="allow(false, 3)" color="error">
          临时拒绝此{{ param.permissionContent }}
        </v-btn>
        <v-btn v-if="param.wildcard" @click="allow(false, 2)" color="error"
          >临时拒绝全部{{ param.permissionContent }}</v-btn
        >
        <v-btn @click="allow(false, 5)" color="error">
          总是拒绝此{{ param.permissionContent }}
        </v-btn>
        <v-btn
          v-if="param.wildcard && num > 2"
          @click="allow(false, 4)"
          color="error"
          >总是拒绝全部{{ param.permissionContent }}</v-btn
        >
      </div>
    </v-main>
  </v-app>
</template>

<script lang="ts">
import { Vue, Component } from 'vue-property-decorator';
import { ConfirmParam } from '@App/apps/grant/interface';
import { MsgCenter } from '@App/apps/msg-center/msg-center';
import { PermissionConfirm } from '@App/apps/msg-center/event';
import { ScriptController } from '@App/apps/script/controller';
@Component({})
export default class Confirm extends Vue {
  scriptConrtoller: ScriptController = new ScriptController();

  protected param: ConfirmParam = <ConfirmParam>{};
  protected num = 0;
  protected timeout = 30;
  protected uuid = '';
  protected select = false;
  async mounted() {
    let url = new URL(location.href);
    let uuid = url.searchParams.get('uuid');
    if (!uuid) {
      return;
    }
    this.uuid = uuid;
    [this.param, this.num] = await this.scriptConrtoller.getConfirmInfo(uuid);
    console.log(this.num);
    let i = setInterval(() => {
      this.timeout--;
      if (!this.timeout) {
        clearInterval(i);
        this.ignore();
      }
    }, 1000);

    window.addEventListener('beforeunload', () => {
      if (!this.select) {
        this.ignore();
      }
    });
  }

  ignore() {
    this.allow(false, 1);
  }

  allow(allow: boolean, type: number) {
    this.select = true;
    MsgCenter.connect(PermissionConfirm + this.uuid, {
      allow: allow,
      type: type,
    }).addListener(() => {
      window.close();
    });
    setTimeout(() => {
      window.close();
    }, 1000);
  }
}
</script>

<style></style>
