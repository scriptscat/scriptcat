<template>
  <div>
    <div>{{ param.title }}</div>
    <div v-for="(val, key) in param.metadata" :key="key">
      <span>{{ key + ":" + val }}</span>
    </div>
    <div>{{ param.describe }}</div>
    <v-btn @click="ignore">忽略({{ timeout }}秒)</v-btn>
    <div>
      <v-btn @click="allow(true, 1)">允许一次</v-btn>
      <v-btn v-if="param.wildcard" @click="allow(true, 2)">临时允许</v-btn>
      <v-btn @click="allow(true, 3)">
        临时允许此{{ param.permissionContent }}
      </v-btn>
      <v-btn v-if="param.wildcard" @click="allow(true, 4)">总是允许</v-btn>
      <v-btn @click="allow(true, 5)">
        总是允许此{{ param.permissionContent }}
      </v-btn>
    </div>

    <div>
      <v-btn @click="allow(false, 1)">拒绝一次</v-btn>
      <v-btn v-if="param.wildcard" @click="allow(false, 2)">临时拒绝</v-btn>
      <v-btn @click="allow(false, 3)" color="error">
        临时拒绝此{{ param.permissionContent }}
      </v-btn>
      <v-btn v-if="param.wildcard" @click="allow(false, 4)" color="error"
        >总是拒绝</v-btn
      >
      <v-btn @click="allow(false, 5)" color="error">
        总是拒绝此{{ param.permissionContent }}
      </v-btn>
    </div>
  </div>
</template>

<script lang="ts">
import { App } from "@App/apps/app";
import { Vue, Component } from "vue-property-decorator";
import { ConfirmParam } from "@App/apps/grant/interface";
import { MsgCenter } from "@App/apps/msg-center/msg-center";
import { PermissionConfirm, ScriptGrant } from "@App/apps/msg-center/event";
@Component({})
export default class Confirm extends Vue {
  protected param: ConfirmParam = {};
  protected timeout: number = 30;
  protected uuid = "";
  async mounted() {
    let url = new URL(location.href);
    let uuid = url.searchParams.get("uuid");
    if (!uuid) {
      return;
    }
    this.uuid = uuid;
    this.param = await App.Cache.get("confirm:uuid:" + uuid);
    console.log(this.param);
    let i = setInterval(() => {
      this.timeout--;
      if (!this.timeout) {
        clearInterval(i);
        this.ignore();
      }
    }, 1000);
  }

  ignore() {
    this.allow(false, 1);
  }

  allow(allow: boolean, type: number) {
    MsgCenter.connect(PermissionConfirm + this.uuid, {
      allow: allow,
      type: type
    }).addListener(() => {
      window.close();
    });
    setTimeout(() => {
      window.close();
    }, 1000);
  }
}
</script>

<style>
</style>
