<template>
  <div>
    <v-simple-table dense>
      <template v-slot:top>
        <div class="d-flex justify-end">
          <v-btn depressed color="error" @click="clear">
            清空日志
          </v-btn>
        </div>
      </template>
      <template v-slot:default>
        <thead>
          <tr>
            <th class="text-left">等级</th>
            <th class="text-left">标题</th>
            <th class="text-left">内容</th>
            <th class="text-left">来源</th>
            <th class="text-left">时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(log, index) in logs" :key="index">
            <td>
              <v-chip
                :color="mapLevelToColor(log.level)"
                text-color="white"
                small
                label
              >
                {{ log.level }}
              </v-chip>
            </td>
            <td>{{ log.title }}</td>
            <td>{{ log.message }}</td>
            <td>{{ log.origin }}</td>
            <td>{{ formatTime(log.createtime) }}</td>
          </tr>
        </tbody>
      </template>
      <template v-slot:no-data> 暂无日志 </template>
    </v-simple-table>
    <v-pagination
      v-if="length > 1"
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

  clear() {
    this.logs = [];
    this.length = 0;
    this.logger.table.clear();
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
    return dayjs(time).format("MM-DD HH:mm:ss");
  }
}
</script>
