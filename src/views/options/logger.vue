<template>
  <div>
    <div v-for="(log, index) in logs" :key="log.id">
      <span>{{ index + 1 }}</span>
      <span>{{ log.level }}</span>
      <span>{{ log.origin }}</span>
      <span>{{ log.message }}</span>
      <span>{{ new Date(log.createtime).toString() }}</span>
    </div>
  </div>
</template>

<script lang="ts">
import { Logger } from "@App/apps/logger/logger";
import { LoggerModel } from "@App/model/logger";
import { Page } from "@App/pkg/utils";
import { Vue, Component } from "vue-property-decorator";

@Component({})
export default class App extends Vue {
  protected logs: Array<Logger> = new Array();
  protected logger: LoggerModel = new LoggerModel();

  mounted() {
    this.logger.list(new Page(1, 20)).then((result) => {
      this.logs = result;
    });
  }
}
</script>
