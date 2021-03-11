<template>
  <div>
    <div>{{ param.title }}</div>
    <div v-for="(val, key) in param.metadata" :key="key">
      <span>{{ key + ":" + val }}</span>
    </div>
  </div>
</template>

<script lang="ts">
import { App } from "@App/apps/app";
import { Vue, Component } from "vue-property-decorator";
import { PermissionParam } from "@App/apps/grant/interface";
@Component({})
export default class Confirm extends Vue {
  protected param: PermissionParam = {};

  async mounted() {
    let url = new URL(location.href);
    let uuid = url.searchParams.get("uuid");
    if (!uuid) {
      return;
    }
    this.param = await App.Cache.get("confirm:uuid:" + uuid);
  }
}
</script>

<style>
</style>
