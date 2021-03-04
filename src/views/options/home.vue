<template>
  <div>
    <div v-for="(script, index) in scripts" :key="script.id">
      <span>{{ script.id }} - </span>
      <span>{{ script.name }}</span>
      <router-link :to="/edit/ + script.id">编辑</router-link>
      <button @click="enable(index)">
        {{ script.status == 1 ? "关闭" : "开启" }}
      </button>
      <button @click="uninstall(index)">删除</button>
    </div>
  </div>
</template>

<script lang="ts">
import { Vue, Component } from "vue-property-decorator";
import { ScriptManager } from "@App/apps/script/manager";
import {
  Script,
  SCRIPT_STATUS_ENABLE,
  SCRIPT_STATUS_DISABLE,
} from "@App/model/script";

@Component({})
export default class App extends Vue {
  protected scripts: Array<Script> = new Array();
  protected scriptUtil: ScriptManager = new ScriptManager(undefined);

  mounted() {
    this.scriptUtil.scriptList(undefined).then((result) => {
      this.scripts = result;
    });
  }

  enable(index: number) {
    if (this.scripts[index].status == SCRIPT_STATUS_ENABLE) {
      this.scripts[index].status = SCRIPT_STATUS_DISABLE;
    } else {
      this.scripts[index].status = SCRIPT_STATUS_ENABLE;
    }
    this.scriptUtil.updateScript(this.scripts[index]);
  }

  async uninstall(index: number) {
    await this.scriptUtil.uninstallScript(this.scripts[index]);
    this.scripts.splice(index, 1);
  }
}
</script>
