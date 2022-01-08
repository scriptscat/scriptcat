<template>
  <v-app>
    <v-app-bar color="#1296DB" dense dark app>
      <v-toolbar-title>ScriptCat</v-toolbar-title>
      <v-spacer></v-spacer>
    </v-app-bar>
    <v-main>
      <div style="padding: 10px">
        <div class="description">
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
            <div v-if="loading" class="text-subtitle-2">
              脚本加载进度: {{ cur }}/{{ total }}
            </div>
          </div>
          <v-list two-line>
            <v-list-item-group
              v-model="selectedScript"
              multiple
              active-class="blue--text"
            >
              <template v-for="(item, index) in scripts">
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
                      v-if="item.script.metadata['author']"
                      v-text="'作者: ' + item.script.metadata['author'][0]"
                    ></v-list-item-subtitle>
                    <v-list-item-subtitle
                      v-if="item.script.metadata['description']"
                      v-text="'描述: ' + item.script.metadata['description'][0]"
                    ></v-list-item-subtitle>
                    <v-list-item-subtitle
                      v-if="item.download_url"
                      v-text="'来源: ' + item.download_url"
                    ></v-list-item-subtitle>
                    <v-list-item-subtitle
                      >操作:
                      {{
                        item.hasOld ? "更新脚本" : "安装脚本"
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
                  v-if="index < scripts.length - 1"
                  :key="index"
                ></v-divider>
              </template>
            </v-list-item-group>
          </v-list>
        </div>

        <div
          v-if="subscribes.length"
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
              <template v-for="(item, index) in subscribes">
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
                  v-if="index < subscribes.length - 1"
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
import { ResourceManager } from '@App/apps/resource';
import { ScriptController } from '@App/apps/script/controller';
import {
  ImportResource,
  ImportScript,
  ImportSubscribe,
} from '@App/model/do/backup';
import {
  Script,
  SCRIPT_STATUS_DISABLE,
  SCRIPT_STATUS_ENABLE,
} from '@App/model/do/script';
import { Subscribe, SUBSCRIBE_STATUS_ENABLE } from '@App/model/do/subscribe';
import { Backup, JsonBackup, ZipBackup } from '@App/pkg/utils/backup';
import { base64ToStr, waitGroup } from '@App/pkg/utils/utils';
import { Component, Vue } from 'vue-property-decorator';
import { parseStorageValue } from '../utils';

type ShowScript = {
  name: string;
  download_url: string;
  subscribe_url?: string;
  background?: boolean;
  enabled: boolean;
  error?: string;
  hasOld?: boolean;
  script?: Script;
  import: ImportScript;
};

type ShowSubscribe = {
  name: string;
  url: string;
  enabled: boolean;
  error?: string;
  hasOld?: boolean;
  subscribe?: Subscribe;
  import: ImportSubscribe;
};

@Component({})
export default class Index extends Vue {
  isSelectAllScript = true;
  selectedScript: number[] = [];
  scriptNum = 0;

  isSelectAllSubscribe = true;
  selectedSubscribe: number[] = [];
  subscribeNum = 0;

  scriptCtrl = new ScriptController();
  resourceMgr = new ResourceManager();
  importLoading = false;
  file: File = <File>(<unknown>{ scripts: [] });
  scripts: ShowScript[] = [];
  subscribes: ShowSubscribe[] = [];

  async mounted() {
    let url = new URL(location.href);
    let uuid = url.searchParams.get('uuid');
    if (!uuid) {
      return;
    }
    void this.load(await this.scriptCtrl.getImportFile(uuid));
  }

  backupFactory(name: string, url: string): Promise<Backup> {
    return new Promise((resolve) => {
      void fetch(url).then(async (res) => {
        let backup: Backup;
        if (name.endsWith('.zip')) {
          backup = new ZipBackup();
        } else {
          backup = new JsonBackup();
        }
        backup.Progress((cur, total) => {
          this.cur = cur;
          this.total = total;
        });
        void backup.Import(await res.blob()).then(() => {
          resolve(backup);
        });
      });
    });
  }

  loading = false;
  cur = 0;
  total = 0;

  async load(file: { name: string; url: string }) {
    this.loading = true;
    const backup = await this.backupFactory(file.name, file.url);
    let importScript;
    while ((importScript = backup.ReadScript())) {
      let script: ShowScript = {
        name: (importScript.options && importScript.options.name) || '-',
        download_url:
          (importScript.options && importScript.options.download_url) || '',
        enabled: importScript.enabled,
        subscribe_url:
          (importScript.options && importScript.options.subscribe_url) || '',
        import: importScript,
      };
      let [newScript, oldScript] = await this.scriptCtrl.prepareScriptByCode(
        importScript.source,
        script.download_url
      );
      if (typeof oldScript === 'string' || !newScript) {
        script.error = <string>oldScript || 'error';
        this.scripts.push(script);
        continue;
      }
      if (oldScript) {
        script.enabled = oldScript.status == SCRIPT_STATUS_ENABLE;
      }
      script.name = newScript.name;
      //TODO:处理selfMetadata信息
      // newScript.selfMetadata = script.self_metadata;
      newScript.subscribeUrl = script.subscribe_url;
      script.hasOld = oldScript ? true : false;
      script.script = newScript;
      script.background = newScript?.type !== 1;
      this.scripts.push(script);
    }
    let importSubscribe;
    while ((importSubscribe = backup.ReadSubscribe())) {
      let subscribe: ShowSubscribe = {
        name: importSubscribe.options.name,
        url: importSubscribe.options.url,
        enabled: importSubscribe.enabled,
        import: importSubscribe,
      };
      let [newSub, oldSub] = await this.scriptCtrl.prepareSubscribeByCode(
        importSubscribe.source,
        subscribe.url
      );
      if (typeof oldSub === 'string' || !newSub) {
        subscribe.error = <string>oldSub || 'error';
        this.subscribes.push(subscribe);
        continue;
      }
      if (oldSub) {
        subscribe.enabled = oldSub.status == SUBSCRIBE_STATUS_ENABLE;
      }
      newSub.scripts = importSubscribe.scripts;
      subscribe.subscribe = newSub;
      subscribe.hasOld = oldSub ? true : false;
      this.subscribes.push(subscribe);
    }
    this.selectAll();
    this.selectAllSubscribe();
    this.loading = false;
  }

  importResource(resources: ImportResource[]): Promise<boolean> {
    return new Promise((resolve) => {
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
        void handle();
      }
    });
  }

  async importFile() {
    this.importLoading = true;
    this.scriptNum = 0;
    this.subscribeNum = 0;
    let wait = new waitGroup(() => {
      this.importLoading = false;
      if (this.scriptNum !== this.selectedScript.length) {
        return alert('有脚本导入失败');
      }
      if (this.subscribeNum !== this.selectedSubscribe.length) {
        return alert('有订阅导入失败');
      }
      this.closeWindow();
    });
    wait.add(this.selectedScript.length);
    wait.add(this.selectedSubscribe.length);
    for (let i = 0; i < this.selectedScript.length; i++) {
      let val = this.selectedScript[i];
      let scriptInfo = this.scripts[val];
      if (scriptInfo.error) {
        this.scriptNum += 1;
        wait.done();
        continue;
      }
      // 并发处理,缩短io时间
      let handle = async () => {
        let script = scriptInfo.script;
        if (!script) {
          return;
        }
        script.status = scriptInfo.enabled
          ? SCRIPT_STATUS_ENABLE
          : SCRIPT_STATUS_DISABLE;
        // 如果有资源 先导入资源
        if (scriptInfo.import.requires) {
          await this.importResource(scriptInfo.import.requires);
        }
        if (scriptInfo.import.resources) {
          await this.importResource(scriptInfo.import.resources);
        }
        if (scriptInfo.import.requires_css) {
          await this.importResource(scriptInfo.import.requires_css);
        }
        await this.scriptCtrl.notWaitUpdate(script);
        // 导入value数据
        if (scriptInfo.import.storage) {
          let subWait = new waitGroup(() => {
            this.scriptNum += 1;
            wait.done();
          });
          subWait.add(Object.keys(scriptInfo.import.storage.data).length);
          for (const key in scriptInfo.import.storage.data) {
            let importValue = async () => {
              if (!scriptInfo.import.storage || !script) {
                return;
              }
              let val = parseStorageValue(scriptInfo.import.storage.data[key]);
              await this.scriptCtrl.updateValue(
                key,
                val,
                script.id,
                script.metadata['storagename'] &&
                  script.metadata['storagename'][0]
              );
              subWait.done();
            };
            void importValue();
          }
        }
      };
      try {
        void handle();
      } catch (e) {
        console.log(e, scriptInfo);
        wait.done();
      }
    }
    for (let i = 0; i < this.selectedSubscribe.length; i++) {
      let val = this.selectedSubscribe[i];
      let subscribeInfo = this.subscribes[val];
      if (subscribeInfo.error) {
        this.subscribeNum += 1;
        wait.done();
        continue;
      }
      try {
        if (!subscribeInfo.subscribe) {
          continue;
        }
        await this.scriptCtrl.subscribeModel.save(subscribeInfo.subscribe);
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
      this.scripts.forEach((_, index) => {
        this.selectedScript.push(index);
      });
    }
  }

  selectAllSubscribe() {
    if (this.isSelectAllSubscribe) {
      this.subscribes.forEach((_, index) => {
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
