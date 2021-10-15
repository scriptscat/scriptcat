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
              hide-details
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
          <div class="text-subtitle-2">
            导入数量: {{ num }}/{{ selected.length }}
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
import { File, Resource } from "@App/model/do/back";
import {
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
} from "@App/model/do/script";
import { base64ToStr, waitGroup } from "@App/pkg/utils";
import { Component, Vue } from "vue-property-decorator";

@Component({})
export default class Index extends Vue {
  isSelectAll = true;
  selected: number[] = [];
  scriptCtrl = new ScriptController();
  resourceMgr = new ResourceManager();
  importLoading = false;
  file: File = <File>(<unknown>{ scripts: [] });
  num: number = 0;

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
      let code = base64ToStr(script.source);
      let [newScript, oldScript] = await this.scriptCtrl.prepareScriptByCode(
        code,
        script.file_url || "",
        script.file_url ? undefined : script.uuid
      );
      if (typeof oldScript === "string") {
        script.error = <string>oldScript;
        continue;
      }
      if (oldScript) {
        script.enabled = oldScript.status == SCRIPT_STATUS_ENABLE;
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

  importResource(resources: Resource[]): Promise<boolean> {
    return new Promise(async (resolve) => {
      let wait = new waitGroup(() => {
        resolve(true);
      });
      wait.add(resources.length);
      for (let i = 0; i < resources.length; i++) {
        let handle = async () => {
          let require = resources[i];
          let old = await this.resourceMgr.getResource(require.meta.url);
          let resource = this.resourceMgr.parseContent(
            require.meta.url,
            base64ToStr(require.source),
            require.meta.mimetype
          );
          if (old) {
            resource.id = old.id;
            if (resource.hash.sha512 == old.hash.sha512) {
              wait.done();
              return;
            }
          }
          await this.resourceMgr.model.save(resource);
          wait.done();
        };
        handle();
      }
      resolve(true);
    });
  }

  importFile() {
    this.importLoading = true;
    let _this = this;
    this.num = 0;
    let wait = new waitGroup(() => {
      _this.importLoading = false;
    });
    wait.add(this.selected.length);
    for (let i = 0; i < this.selected.length; i++) {
      let val = this.selected[i];
      let scriptInfo = this.file.scripts[val];
      if (scriptInfo.error) {
        wait.done();
        continue;
      }
      let t1 = new Date().getTime();
      // 并发处理,缩短io时间
      let handle = async () => {
        let script = scriptInfo.script!;
        script.status = scriptInfo.enabled
          ? SCRIPT_STATUS_ENABLE
          : SCRIPT_STATUS_DISABLE;
        // 如果有资源 先导入资源
        if (scriptInfo.requires) {
          await this.importResource(scriptInfo.requires);
        }
        if (scriptInfo.resources) {
          await this.importResource(scriptInfo.resources);
        }
        if (scriptInfo.requires_css) {
          await this.importResource(scriptInfo.requires_css);
        }
        await this.scriptCtrl.notWaitUpdate(script);
        // 导入value数据
        if (scriptInfo.storage) {
          let subWait = new waitGroup(() => {
            this.num += 1;
            wait.done();
            console.log(i, new Date().getTime() - t1);
          });
          subWait.add(Object.keys(scriptInfo.storage.data).length);
          for (const key in scriptInfo.storage.data) {
            let importValue = async () => {
              let val = this.parseValue(scriptInfo.storage.data[key]);
              await this.scriptCtrl.updateValue(
                key,
                val,
                script.id,
                script.metadata["storagename"] &&
                  script.metadata["storagename"][0]
              );
              subWait.done();
            };
            importValue();
          }
        }
      };
      handle();
    }
  }

  parseValue(str: string): any {
    let t = str[0];
    let s = str.substring(1);
    switch (t) {
      case "s":
        return s;
      case "b":
        return s == "true";
      case "n":
        return parseFloat(s);
      default:
        return JSON.parse(s);
    }
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
