<template>
  <v-form v-model="valid">
    <v-container>
      <template v-if="metaBuffer">
        <div v-for="([key], index) in Object.entries(metaBuffer)" :key="index">
          <template v-if="['name'].includes(key)">
            <v-text-field
              v-model="metaBuffer[key]"
              :counter="10"
              :label="key"
              required
            ></v-text-field>
          </template>
          <template v-else-if="['license'].includes(key)">
            <v-select
              v-model="metaBuffer[key]"
              :items="licence"
              label="license"
            ></v-select>
          </template>
          <template v-else-if="['version'].includes(key)">
            version
            <v-row justify="center">
              <v-col
                cols="1"
                v-for="(number, index) in metaBuffer[key]"
                :key="index"
              >
                <v-text-field
                  v-model="metaBuffer[key][index]"
                  hide-details
                  type="number"
                  :style="{ width: '60px' }"
                />
              </v-col>
            </v-row>
          </template>
          <template v-else-if="['run-at'].includes(key)">
            <v-select
              v-model="metaBuffer[key]"
              :items="runAtHooks"
              label="run-at"
            ></v-select>
          </template>
          <template v-else-if="key.startsWith('description')">
            <v-textarea
              v-model="metaBuffer[key]"
              name="input-7-1"
              :label="key"
              rows="1"
              auto-grow
            ></v-textarea>
          </template>
          <template v-else-if="['compatible'].includes(key)">
            compatible
            <v-row>
              <v-checkbox
                v-for="browser in browsers"
                :key="browser"
                v-model="metaBuffer[key]"
                :label="browser"
                :value="browser"
              ></v-checkbox>
            </v-row>
          </template>
          <template v-else-if="['grant'].includes(key)">
            <v-combobox
              v-model="metaBuffer[key]"
              :items="grant"
              label="grant"
              multiple
              chips
            >
              <template v-slot:selection="{ attrs, item, selected }">
                <v-chip
                  v-bind="attrs"
                  :color="`${item.color} lighten-3`"
                  :input-value="selected"
                  label
                  small
                >
                  <span class="pr-2">
                    {{ item.text }}
                  </span>
                </v-chip>
              </template>
            </v-combobox>
          </template>
          <template v-else-if="['match'].includes(key)">
            <v-combobox
              v-model="metaBuffer[key]"
              :filter="filter"
              :hide-no-data="!search"
              :items="items"
              :search-input.sync="search"
              hide-selected
              label="match"
              multiple
              small-chips
            >
              <template v-slot:no-data>
                <v-list-item>
                  <span class="subheading">Create</span>
                  <v-chip :color="`${colors[nonce - 1]} lighten-3`" label small>
                    {{ search }}
                  </v-chip>
                </v-list-item>
              </template>
              <template v-slot:selection="{ attrs, item, parent, selected }">
                <v-chip
                  v-if="item === Object(item)"
                  v-bind="attrs"
                  :color="`${item.color} lighten-3`"
                  :input-value="selected"
                  label
                  small
                >
                  <span class="pr-2">
                    {{ item.text }}
                  </span>
                  <v-icon small @click="parent.selectItem(item)">
                    close
                  </v-icon>
                </v-chip>
              </template>
              <template v-slot:item="{ index, item }">
                <v-text-field
                  v-if="editing === item"
                  v-model="editing.text"
                  autofocus
                  flat
                  background-color="transparent"
                  hide-details
                  solo
                  @keyup.enter="edit(index, item)"
                ></v-text-field>
                <v-chip
                  v-else
                  :color="`${item.color} lighten-3`"
                  dark
                  label
                  small
                >
                  {{ item.text }}
                </v-chip>
                <v-spacer></v-spacer>
                <v-list-item-action @click.stop>
                  <v-btn icon @click.stop.prevent="edit(index, item)">
                    <v-icon>{{
                      editing !== item ? "mdi-pencil" : "mdi-check"
                    }}</v-icon>
                  </v-btn>
                </v-list-item-action>
              </template>
            </v-combobox>
          </template>

          <template v-else>
            <v-text-field
              v-model="metaBuffer[key]"
              :counter="10"
              :label="key"
              required
            ></v-text-field>
          </template>

          <!-- todo require 自动补全，比如输入jQuery，自动补全为cdn.jsdelivr.net下的最新版本 -->
        </div>
      </template>

      <v-btn color="success" @click="updateConfig()"> 更新设置 </v-btn>
    </v-container>
  </v-form>
</template>

<script lang="ts">
import { Component, Prop, Vue } from "vue-property-decorator";

const grant = [
  "GM_setValue",
  "GM_getValue",
  "GM_setClipboard",
  "GM_xmlhttpRequest",
  "GMSC_xmlhttpRequest",
  "GM_notification",
  "GM_closeNotification",
  "GM_updateNotification",
  "GM_log",
  "CAT_setLastRuntime",
  "CAT_setRunError",
  "CAT_runComplete",
  "GM_cookie",
  "CAT_setProxy",
  "CAT_clearProxy",
  "unsafeWindow",
];

const colors = ["green", "purple", "indigo", "cyan", "teal", "orange"];

function getRandomColor() {
  return colors[Math.floor(Math.random() * colors.length)];
}

function formatConfigProperty(key: string, value: string) {
  return `// @${key.padEnd(20, " ")}${value}`;
}

@Component({})
export default class CloseButton extends Vue {
  grant = grant.map((text) => ({
    text,
    color: getRandomColor(),
  }));

  /** 从metadata中提取为适合form的格式 */
  prepareMetaBuffer(metaData: { [key: string]: string[] }) {
    const buffer: {
      grant?: { text: string; color: string }[];
      [key: string]: any[] | undefined;
    } = {};

    for (const [key, values] of Object.entries(metaData)) {
      if (["grant", "match", "connect", "require"].includes(key)) {
        const newValues = [];

        for (const value of values) {
          newValues.push({ text: value, color: getRandomColor() });
        }

        buffer[key] = newValues;
      } else if (key === "version") {
        buffer[key] = values[0].split(".");
      } else if (key === "compatible") {
        buffer[key] = values.map((item) => item.toLowerCase());
      } else {
        buffer[key] = values;
      }
    }

    this.metaBuffer = buffer;
  }

  /** 从form格式还原为metadata格式 */
  formatConfig() {
    const buffer: { [key: string]: string[] } = {};

    for (const [key, values] of Object.entries(this.metaBuffer)) {
      if (["grant", "match", "connect", "require"].includes(key)) {
        const castValues = values as { text: string; color: string }[];

        buffer[key] = castValues.map((value) => value.text);
      } else if (key === "version") {
        const castValues = values as string[];

        buffer[key] = [castValues.join(".")];
      } else {
        if (Array.isArray(values)) {
          buffer[key] = values;
        } else {
          // 如name，单选select(license)等
          const castValues = (values as unknown) as string;

          buffer[key] = [castValues];
        }
      }
    }

    return buffer;
  }

  /** 同步META表单至code */
  async updateConfig() {
    // 提取不包含config的纯代码
    const oldCode = this.script.code;

    console.log(oldCode);
    const pureCode = new RegExp(`^.*?==/UserScript==(.*)$`, "ms").exec(
      oldCode
    )![1];
    console.log(pureCode);

    // 格式化当前表单
    const formattedConfig = this.formatConfig();
    console.log(formattedConfig);

    // const { name, ...rest } = formattedConfig;

    let result = "// ==UserScript==\n";

    for (const [key, values] of Object.entries(formattedConfig)) {
      for (const value of values) {
        result += formatConfigProperty(key, value) + "\n";
      }
    }

    result += "// ==/UserScript==";
    console.log(result);

    // 拼接新config和code
    const newCode = result + pureCode;

    // 这里只更新了code
    this.script.code = newCode;
    this.script.name = formattedConfig.name.flat()[0];
    // 更新脚本的metadata
    this.script.metadata = JSON.parse(JSON.stringify(formattedConfig));
    // 同步至indexDB
    await this.scriptMgr.updateScript(this.script);

    // 保存成功后
    this.snackbar = true;
    this.snackbarInfo = "config更新成功";
    setTimeout(() => {
      this.snackbar = false;
    }, 4000);

    await this.initialSctipt();
  }
}
</script>

<style>
</style>