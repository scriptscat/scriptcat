<template>
  <div>
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

    <v-pagination
      v-model="page"
      :length="length"
      :total-visible="7"
    ></v-pagination>
  </div>
</template>

<script lang="ts">
import { Logger } from "@App/apps/logger/logger";
import { LoggerModel } from "@App/model/logger";
import {
  LOGGER_LEVEL_DEBUG,
  LOGGER_LEVEL_ERROR,
  LOGGER_LEVEL_INFO,
  LOGGER_LEVEL_WARN,
} from "@App/model/do/logger";
import { Page } from "@App/pkg/utils";
import { Vue, Component, Watch } from "vue-property-decorator";

import dayjs from "dayjs";

@Component({})
export default class Logger_ extends Vue {
  protected logs: Array<Logger> = new Array();
  protected logger: LoggerModel = new LoggerModel();

  page = 1;
  count = 20;
  length = 1;

  @Watch("page")
  onPageChange(newPage: number) {
    this.logger.list(new Page(newPage, this.count)).then((result) => {
      this.logs = result;
    });
  }

  created() {
    // todo 日志也可以使用data-table，list有点丑
    this.logger.list(new Page(1, 20)).then((result) => {
      this.logs = result;
    });

    this.logger.list(new Page(1, 1000)).then((result) => {
      this.length = Math.ceil(result.length / this.count);
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
