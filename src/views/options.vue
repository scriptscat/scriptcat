<template>
  <div style="height: 100%">
    <div>
      <router-link to="/">脚本列表</router-link>
      <router-link to="/">管理设置</router-link>
    </div>
    <div style="margin-top:10px;height: 100%;"><router-view></router-view></div>
  </div>
</template>

<script lang="ts">
import { Vue, Prop } from "vue-property-decorator";

export default class App extends Vue {}
</script>
