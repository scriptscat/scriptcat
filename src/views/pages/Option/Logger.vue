<template>
  <v-app>
    <div
      v-for="(log, index) in logs"
      :key="index"
      :style="{ display: 'flex', marginRight: '10px', height: '30px' }"
    >
      <span :style="{ width: '15px' }">{{ index + 1 }}</span>

      <span>{{ formatTime(log.createtime) }}</span>

      <span :style="{ width: '70px', display: 'grid', placeItems: 'center' }">
        <v-chip
          :color="mapLevelToColor(log.level)"
          text-color="white"
          small
          label
        >
          {{ log.level }}
        </v-chip>
      </span>

      <span>{{ log.title }}</span>

      <span>{{ log.origin }}</span>

      <span>{{ log.message }}</span>
    </div>
  </v-app>
</template>

<script lang="ts">
import { Logger } from "@App/apps/logger/logger";
import {
  LoggerModel,
  LOGGER_LEVEL_DEBUG,
  LOGGER_LEVEL_ERROR,
  LOGGER_LEVEL_INFO,
  LOGGER_LEVEL_WARN,
} from "@App/model/logger";
import { Page } from "@App/pkg/utils";
import { Vue, Component } from "vue-property-decorator";

import dayjs from "dayjs";

@Component({})
export default class App extends Vue {
  protected logs: Array<Logger> = new Array();
  protected logger: LoggerModel = new LoggerModel();

  mounted() {
    this.logger.list(new Page(1, 20)).then((result) => {
      this.logs = result;
    });
  }

  mapLevelToColor(level: string) {
    let color: string | undefined = undefined;

    switch (level) {
      case LOGGER_LEVEL_DEBUG:
        break;

      case LOGGER_LEVEL_INFO:
        color = "blue";
        break;

      case LOGGER_LEVEL_WARN:
        color = "orange";
        break;

      case LOGGER_LEVEL_ERROR:
        color = "red";
        break;
    }

    return color;
  }

  formatTime(time: Date) {
    dayjs(time).format("YYYY-MM-DD");
  }
}
</script>
