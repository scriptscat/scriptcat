<template>
  <div :style="{ height: '100%' }">
    <div :style="{ height: '10%' }">script cat logo</div>
    <v-tabs background-color="cyan">
      <v-tab to="/edit">新建脚本</v-tab>
      <v-tab to="/">脚本列表</v-tab>
      <v-tab to="/logger">运行日志</v-tab>
      <!-- <router-link to="/">管理设置</router-link> -->
    </v-tabs>
    <div style="margin-top: 10px; height: 100%">
      <router-view></router-view>
    </div>
  </div>
</template>

<script lang="ts">
import devtools from "@vue/devtools";
import { Vue, Component } from "vue-property-decorator";

if (process.env.NODE_ENV === "development") {
  devtools.connect(/* host, port */);
}

@Component({})
export default class App extends Vue {}
</script>
