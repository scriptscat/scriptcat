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
          <div class="control d-flex justify-start" style="margin: 10px 0">
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
          <div
            class="control d-flex justify-start align-center"
            style="margin: 10px 0"
          >
            <div class="subtitle-2">请选择你要导入的脚本:</div>
            <v-checkbox
              v-model="isSelectAllScript"
              label="全选"
              color="secondary"
              @change="selectAll"
              style="margin: 0 10px; padding: 0"
              hide-details
            ></v-checkbox>
            <div class="text-subtitle-2">
              脚本导入进度: {{ scriptNum }}/{{ selectedScript.length }}
            </div>
          </div>
          <v-list two-line>
            <v-list-item-group
              v-model="selectedScript"
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
                      {{ item.enabled ? "开启脚本" : "关闭脚本" }}
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

        <div
          v-if="file.subscribes"
          class="script-list"
          style="border-top: 1px dashed"
        >
          <div
            class="control d-flex justify-start align-center"
            style="margin: 10px 0"
          >
            <div class="subtitle-2">请选择你要导入的订阅:</div>
            <v-checkbox
              v-model="isSelectAllScript"
              label="全选"
              color="secondary"
              @change="selectAllSubscribe"
              style="margin: 0 10px; padding: 0"
              hide-details
            ></v-checkbox>
            <div class="text-subtitle-2">
              订阅导入进度: {{ subscribeNum }}/{{ selectedSubscribe.length }}
            </div>
          </div>
          <v-list two-line>
            <v-list-item-group
              v-model="selectedScript"
              multiple
              active-class="orange--text"
            >
              <template v-for="(item, index) in file.subscribes">
                <v-list-item :key="'item' + index" v-if="!item.error">
                  <v-list-item-content>
                    <v-list-item-title v-text="item.name"></v-list-item-title>
                    <v-list-item-subtitle
                      v-if="item.metadata['author']"
                      v-text="'作者: ' + item.metadata['author'][0]"
                    ></v-list-item-subtitle>
                    <v-list-item-subtitle
                      v-if="item.metadata['description']"
                      v-text="'描述: ' + item.metadata['description'][0]"
                    ></v-list-item-subtitle>
                    <v-list-item-subtitle
                      v-if="item.url"
                      v-text="'来源: ' + item.url"
                    ></v-list-item-subtitle>
                    <v-list-item-subtitle
                      >操作:
                      {{
                        item.old ? "更新订阅" : "安装订阅"
                      }}</v-list-item-subtitle
                    >
                  </v-list-item-content>
                  <v-list-item-action>
                    <v-list-item-action-text>
                      {{ item.enabled ? "开启订阅" : "关闭订阅" }}
                    </v-list-item-action-text>
                    <v-switch v-model="item.enabled" @click.stop></v-switch>
                  </v-list-item-action>
                </v-list-item>
                <v-list-item v-else :key="'item' + index">
                  <v-list-item-content class="red--text">
                    <v-list-item-title v-text="item.name"> </v-list-item-title>
                    <v-list-item-subtitle
                      v-text="'订阅错误,解析失败' + item.error"
                    ></v-list-item-subtitle>
                  </v-list-item-content>
                </v-list-item>
                <v-divider
                  v-if="index < file.subscribes.length - 1"
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
import { File, Resource } from "@App/model/do/backup";
import {
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
} from "@App/model/do/script";
import { SUBSCRIBE_STATUS_ENABLE } from "@App/model/do/subscribe";
import { base64ToStr, waitGroup } from "@App/pkg/utils/utils";
import { Component, Vue } from "vue-property-decorator";
import { parseStorageValue } from "../utils";

@Component({})
export default class Index extends Vue {
  isSelectAllScript = true;
  selectedScript: number[] = [];
  scriptNum: number = 0;

  isSelectAllSubscribe = true;
  selectedSubscribe: number[] = [];
  subscribeNum: number = 0;

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
      // 如果不是scriptcat管理器,处理option变成selfMetadata
      if (file.created_by !== "ScriptCat") {
        // TODO: 以后处理啦
      }
      newScript!.selfMetadata = script.self_metadata;
      newScript!.subscribeUrl = script.subscribe_url;
      script.metadata = newScript?.metadata;
      script.old = oldScript;
      script.script = newScript;
      script.background = newScript?.type !== 1;
    }
    if (file.subscribes) {
      for (let i = 0; i < file.subscribes.length; i++) {
        let subscribe = file.subscribes[i];
        let code = base64ToStr(subscribe.source);
        let [newSub, oldSub] = await this.scriptCtrl.prepareSubscribeByCode(
          code,
          subscribe.url
        );
        if (typeof oldSub === "string") {
          subscribe.error = <string>oldSub;
          continue;
        }
        if (oldSub) {
          subscribe.enabled = oldSub.status == SUBSCRIBE_STATUS_ENABLE;
        }
        newSub!.scripts = subscribe.scripts;
        subscribe.metadata = newSub?.metadata;
        subscribe.subscribe = newSub;
        subscribe.old = oldSub;
      }
    }
    this.file = file;
    this.selectAll();
    this.selectAllSubscribe();
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
          // 因为并发原因,可能会导致url重复,直接忽略错误
          this.resourceMgr.model
            .save(resource)
            .then(() => {
              wait.done();
            })
            .catch(() => {
              wait.done();
            });
        };
        handle();
      }
    });
  }

  async importFile() {
    this.importLoading = true;
    let _this = this;
    this.scriptNum = 0;
    this.subscribeNum = 0;
    let wait = new waitGroup(() => {
      _this.importLoading = false;
      if (this.scriptNum !== this.selectedScript.length) {
        return alert("有脚本导入失败");
      }
      if (this.subscribeNum !== this.selectedSubscribe.length) {
        return alert("有订阅导入失败");
      }
      this.closeWindow();
    });
    wait.add(this.selectedScript.length);
    wait.add(this.selectedSubscribe.length);
    for (let i = 0; i < this.selectedScript.length; i++) {
      let val = this.selectedScript[i];
      let scriptInfo = this.file.scripts[val];
      if (scriptInfo.error) {
        this.scriptNum += 1;
        wait.done();
        continue;
      }
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
            this.scriptNum += 1;
            wait.done();
          });
          subWait.add(Object.keys(scriptInfo.storage.data).length);
          for (const key in scriptInfo.storage.data) {
            let importValue = async () => {
              let val = parseStorageValue(scriptInfo.storage.data[key]);
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
      try {
        handle();
      } catch (e) {
        console.log(e, scriptInfo);
        wait.done();
      }
    }
    for (let i = 0; i < this.selectedSubscribe.length; i++) {
      let val = this.selectedSubscribe[i];
      let subscribeInfo = this.file.subscribes![val];
      if (subscribeInfo.error) {
        this.subscribeNum += 1;
        wait.done();
        continue;
      }
      try {
        await this.scriptCtrl.subscribeModel.save(subscribeInfo.subscribe!);
        this.subscribeNum += 1;
        wait.done();
      } catch (e) {
        console.log(e, subscribeInfo);
        wait.done();
      }
    }
  }

  closeWindow() {
    window.close();
  }

  selectAll() {
    this.selectedScript = [];
    if (this.isSelectAllScript) {
      this.file.scripts.forEach((_, index) => {
        this.selectedScript.push(index);
      });
    }
  }

  selectAllSubscribe() {
    if (this.isSelectAllSubscribe) {
      this.file.subscribes &&
        this.file.subscribes.forEach((_, index) => {
          this.selectedSubscribe.push(index);
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
