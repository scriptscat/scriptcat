<template>
  <v-app>
    <v-app-bar color="#1296DB" dense dark app>
      <v-toolbar-title>ScriptCat</v-toolbar-title>
      <v-spacer></v-spacer>
    </v-app-bar>
    <v-main>
      <div style="padding: 10px">
        <div class="description">
          <div class="text-h6">来源管理器: {{ file.created_by }}</div>
          <div class="control d-flex justify-start" style="margin-bottom: 10px">
            <v-checkbox
              v-model="isSelectAll"
              label="全选"
              color="secondary"
              @change="selectAll"
              style="margin-top: 0; margin-right: 10px"
            ></v-checkbox>
            <v-btn
              @click="importFile"
              :loading="importLoading"
              :disabled="importLoading"
              depressed
              small
              color="primary"
            >
              导入
            </v-btn>
            <v-btn
              @click="closeWindow()"
              style="margin-left: 10px"
              depressed
              small
              color="error"
            >
              关闭
            </v-btn>
          </div>
        </div>
        <div class="script-list">
          <v-list two-line>
            <v-list-item-group
              v-model="selected"
              multiple
              active-class="blue--text"
            >
              <template v-for="(item, index) in file.scripts">
                <v-list-item :key="'item' + index" v-if="!item.error">
                  <v-list-item-content>
                    <v-list-item-title
                      v-html="
                        item.name +
                        (item.background
                          ? '<img src=\'/assets/logo.png\' width=\'16px\'/>'
                          : '')
                      "
                    >
                    </v-list-item-title>
                    <v-list-item-subtitle
                      v-if="item.metadata['author']"
                      v-text="'作者: ' + item.metadata['author'][0]"
                    ></v-list-item-subtitle>
                    <v-list-item-subtitle
                      v-if="item.metadata['description']"
                      v-text="'描述: ' + item.metadata['description'][0]"
                    ></v-list-item-subtitle>
                    <v-list-item-subtitle
                      v-if="item.file_url"
                      v-text="'来源: ' + item.file_url"
                    ></v-list-item-subtitle>
                    <v-list-item-subtitle
                      >操作:
                      {{
                        item.old ? "更新脚本" : "安装脚本"
                      }}</v-list-item-subtitle
                    >
                  </v-list-item-content>
                  <v-list-item-action>
                    <v-list-item-action-text>
                      开启脚本
                    </v-list-item-action-text>
                    <v-switch v-model="item.enabled" @click.stop></v-switch>
                  </v-list-item-action>
                </v-list-item>
                <v-list-item v-else :key="'item' + index">
                  <v-list-item-content class="red--text">
                    <v-list-item-title v-text="item.name"> </v-list-item-title>
                    <v-list-item-subtitle
                      v-text="'脚本错误,解析失败' + item.error"
                    ></v-list-item-subtitle>
                  </v-list-item-content>
                </v-list-item>
                <v-divider
                  v-if="index < file.scripts.length - 1"
                  :key="index"
                ></v-divider>
              </template>
            </v-list-item-group>
          </v-list>
        </div>
      </div>
    </v-main>
  </v-app>
</template>

<script lang="ts">
import { ResourceManager } from "@App/apps/resource";
import { ScriptController } from "@App/apps/script/controller";
import { File } from "@App/model/do/back";
import {
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
} from "@App/model/do/script";
import { Vue, Component } from "vue-property-decorator";

@Component({})
export default class Index extends Vue {
  isSelectAll = true;
  selected: number[] = [];
  scriptCtrl = new ScriptController();
  resourceMgr = new ResourceManager();
  importLoading = false;
  file: File = <File>(<unknown>{ scripts: [] });

  async mounted() {
    let url = new URL(location.href);
    let uuid = url.searchParams.get("uuid");
    if (!uuid) {
      return;
    }
    this.load(await this.scriptCtrl.getImportFile(uuid));
  }

  async load(file: File) {
    for (let i = 0; i < file.scripts.length; i++) {
      let script = file.scripts[i];
      let code = decodeURIComponent(escape(atob(script.source)));
      let [newScript, oldScript] = await this.scriptCtrl.prepareScriptByCode(
        code,
        script.file_url || "",
        script.file_url ? undefined : script.uuid
      );
      if (typeof oldScript === "string") {
        script.error = <string>oldScript;
        continue;
      }
      script.metadata = newScript?.metadata;
      script.old = oldScript;
      script.script = newScript;
      script.background = newScript?.type !== 1;
    }
    file.scripts[0].background = true;
    this.file = file;
    this.selectAll();
  }

  async importFile() {
    this.importLoading = true;
    for (let i = 0; i < this.selected.length; i++) {
      let val = this.selected[i];
      let scriptInfo = this.file.scripts[val];
      let script = scriptInfo.script!;
      script.status = scriptInfo.enabled
        ? SCRIPT_STATUS_ENABLE
        : SCRIPT_STATUS_DISABLE;
      // 如果有资源 先导入资源
      if (scriptInfo.requires) {
        for (let i = 0; i < scriptInfo.requires.length; i++) {
          let require = scriptInfo.requires[i];
          let old = await this.resourceMgr.getResource(require.meta.url);
          let resource = this.resourceMgr.parseContent(
            require.meta.url,
            decodeURIComponent(escape(atob(require.source))),
            require.meta.mimetype
          );
          if (old) {
            resource.id = old.id;
          }
          await this.resourceMgr.model.save(resource);
        }
      }
      await this.scriptCtrl.update(script);
    }
    this.importLoading = false;
    window.close();
  }

  closeWindow() {
    window.close();
  }

  selectAll() {
    this.selected = [];
    if (this.isSelectAll) {
      this.file.scripts.forEach((_, index) => {
        this.selected.push(index);
      });
    }
  }
}
</script>

<style>
.description {
  height: 10%;
}

.script-list {
  height: 90%;
}
</style>
